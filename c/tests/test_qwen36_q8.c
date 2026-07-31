#define QWEN36_NO_MAIN
#include "../qwen36.c"

#include <stdio.h>

static uint32_t rng_state = 0x31415926u;

static uint32_t rng_u32(void) {
    rng_state = rng_state * 1664525u + 1013904223u;
    return rng_state;
}

static float rng_f32(void) {
    return ((int32_t)(rng_u32() >> 8) / 8388608.0f) * 1.75f;
}

static int close_enough(float a, float b) {
    float d = fabsf(a - b);
    float lim = 1e-5f * (1.0f + fmaxf(fabsf(a), fabsf(b)));
    return d <= lim;
}

int main(void) {
#ifdef _WIN32
    _putenv_s("IDOT", "0");
#else
    setenv("IDOT", "0", 1);
#endif

    {
        const unsigned char raw[] = "a\"b\\c\n";
        char escaped[64];
        json_escape(raw, (int)sizeof(raw)-1, escaped, sizeof escaped);
        if (strcmp(escaped, "a\\\"b\\\\c\\n") != 0) {
            fprintf(stderr, "JSON escape mismatch: %s\n", escaped);
            return 1;
        }
    }

    {
        unsigned char raw[255];
        char escaped[1536];
        memset(raw, 1, sizeof raw);
        int n = json_escape(raw, (int)sizeof raw, escaped, sizeof escaped);
        if (n != 6 * (int)sizeof raw || escaped[n] != 0) {
            fprintf(stderr, "worst-case JSON escape truncated: got=%d want=%zu\n",
                    n, 6 * sizeof raw);
            return 1;
        }
    }

    enum { N = 8, I = 64, O = 48 };
    float x[N][I], scales[N][O], ref[N][O], got[N][O];
    int8_t weights[N][O][I];
    const float *xp[N], *sp[N];
    const int8_t *wp[N];

    for (int n = 0; n < N; n++) {
        xp[n] = x[n]; sp[n] = scales[n]; wp[n] = &weights[n][0][0];
        for (int i = 0; i < I; i++) x[n][i] = rng_f32();
        for (int o = 0; o < O; o++) {
            scales[n][o] = 0.0005f + (rng_u32() % 1000) * 0.00001f;
            for (int i = 0; i < I; i++)
                weights[n][o][i] = (int8_t)((int)(rng_u32() % 255) - 127);
        }
        matmul_q(ref[n], x[n], wp[n], sp[n], I, O);
    }

    matmul_q_many(&got[0][0], xp, wp, sp, N, I, O);
    for (int n = 0; n < N; n++) {
        for (int o = 0; o < O; o++) {
            if (!close_enough(ref[n][o], got[n][o])) {
                fprintf(stderr, "batched q8 mismatch n=%d o=%d ref=%g got=%g\n",
                        n, o, ref[n][o], got[n][o]);
                return 1;
            }
        }
    }

    /* The converter stores gate and up rows consecutively. A single 2*O call
     * must be numerically identical to two separate projections. */
    float pair[2*O], separate[2*O];
    float pair_scales[2*O];
    int8_t pair_weights[2*O][I];
    for (int o = 0; o < 2*O; o++) {
        pair_scales[o] = 0.0005f + (rng_u32() % 1000) * 0.00001f;
        for (int i = 0; i < I; i++)
            pair_weights[o][i] = (int8_t)((int)(rng_u32() % 255) - 127);
    }
    matmul_q(pair, x[0], &pair_weights[0][0], pair_scales, I, 2*O);
    matmul_q(separate, x[0], &pair_weights[0][0], pair_scales, I, O);
    matmul_q(separate + O, x[0], &pair_weights[O][0], pair_scales + O, I, O);
    for (int o = 0; o < 2*O; o++) {
        if (!close_enough(pair[o], separate[o])) {
            fprintf(stderr, "gate/up fusion mismatch o=%d pair=%g separate=%g\n",
                    o, pair[o], separate[o]);
            return 1;
        }
    }

    /* The fused DeltaNet recurrence must retain the former four-pass result,
     * including state updates, within ordinary float reduction tolerance. */
    {
        enum { DK = 7, DV = 11 };
        float sr[DK*DV], sf[DK*DV], kd[DK], qd[DK], vd[DV];
        float kv[DV], dl[DV], orf[DV], ofu[DV];
        const float egh = 0.93f, beta = 0.41f;
        for (int i = 0; i < DK*DV; i++) sr[i] = sf[i] = rng_f32() * 0.1f;
        for (int i = 0; i < DK; i++) { kd[i] = rng_f32() * 0.2f; qd[i] = rng_f32() * 0.2f; }
        for (int i = 0; i < DV; i++) vd[i] = rng_f32() * 0.2f;
        for (int i = 0; i < DK*DV; i++) sr[i] *= egh;
        for (int v = 0; v < DV; v++) kv[v] = 0.f;
        for (int k = 0; k < DK; k++)
            for (int v = 0; v < DV; v++) kv[v] += kd[k] * sr[k*DV+v];
        for (int v = 0; v < DV; v++) dl[v] = (vd[v] - kv[v]) * beta;
        for (int k = 0; k < DK; k++)
            for (int v = 0; v < DV; v++) sr[k*DV+v] += kd[k] * dl[v];
        for (int v = 0; v < DV; v++) orf[v] = 0.f;
        for (int k = 0; k < DK; k++)
            for (int v = 0; v < DV; v++) orf[v] += qd[k] * sr[k*DV+v];

        deltanet_recur_head(sf, kd, vd, qd, ofu, DK, DV, egh, beta);
        for (int i = 0; i < DK*DV; i++) {
            if (!close_enough(sr[i], sf[i])) {
                fprintf(stderr, "fused DeltaNet state mismatch i=%d ref=%g got=%g\n", i, sr[i], sf[i]);
                return 1;
            }
        }
        for (int v = 0; v < DV; v++) {
            if (!close_enough(orf[v], ofu[v])) {
                fprintf(stderr, "fused DeltaNet output mismatch v=%d ref=%g got=%g\n", v, orf[v], ofu[v]);
                return 1;
            }
        }
    }

#if defined(__F16C__)
    {
        enum { HI = 64, HO = 24 };
        float hx[HI], hw[HO][HI], href[HO], hgot[HO];
        for (int i = 0; i < HI; i++) hx[i] = rng_f32();
        for (int o = 0; o < HO; o++)
            for (int i = 0; i < HI; i++) hw[o][i] = rng_f32();
        int before = g_hdw_n;
        if (!hdw_register(&hw[0][0], HI, HO) || g_hdw_n != before + 1) {
            fprintf(stderr, "F16C dense registration failed\n");
            return 1;
        }
        const uint16_t *rounded = g_hdw[before].h;
        for (int o = 0; o < HO; o++) {
            float acc = 0.f;
            for (int i = 0; i < HI; i++)
                acc += hx[i] * f16_to_f32(rounded[(int64_t)o * HI + i]);
            href[o] = acc;
        }
        matmul_d(hgot, hx, &hw[0][0], 1, HI, HO);
        for (int o = 0; o < HO; o++) {
            if (!close_enough(href[o], hgot[o])) {
                fprintf(stderr, "F16C dense mismatch o=%d ref=%g got=%g\n",
                        o, href[o], hgot[o]);
                return 1;
            }
        }
    }
#endif

    puts("qwen36 q8/f16 CPU kernels: PASS");
    return 0;
}
