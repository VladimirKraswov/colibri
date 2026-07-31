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

    puts("qwen36 q8 fused kernels: PASS");
    return 0;
}
