/* Synthetic Qwen3.6 Q8 GEMV benchmark for AVX2 hosts.
 *
 * Compares the engine's quality-preserving f32-activation path with an
 * experimental int16-activation path on the three dominant decode shapes.
 * This tool does not change inference defaults; it exists to make Broadwell
 * tuning evidence-driven before a kernel is promoted into qwen36.c.
 */
#define _POSIX_C_SOURCE 200809L
#include <immintrin.h>
#include <math.h>
#include <omp.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct { const char *name; int input, output, reps; } Shape;

static double now_s(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return t.tv_sec + t.tv_nsec * 1e-9;
}

static void *xalloc(size_t n) {
    void *p = NULL;
    if (posix_memalign(&p, 64, n ? n : 64) != 0 || !p) {
        fprintf(stderr, "allocation failed for %.1f MiB\n", n / 1048576.0);
        exit(1);
    }
    return p;
}

static inline float hsum256_ps(__m256 v) {
    __m128 s = _mm_add_ps(_mm256_castps256_ps128(v), _mm256_extractf128_ps(v, 1));
    s = _mm_add_ps(s, _mm_movehl_ps(s, s));
    s = _mm_add_ss(s, _mm_shuffle_ps(s, s, 1));
    return _mm_cvtss_f32(s);
}

static inline float dot_f32_i8(const float *x, const int8_t *w, int n) {
    __m256 a0 = _mm256_setzero_ps(), a1 = _mm256_setzero_ps();
    __m256 a2 = _mm256_setzero_ps(), a3 = _mm256_setzero_ps();
    int i = 0;
    for (; i + 32 <= n; i += 32) {
        __m128i b0 = _mm_loadu_si128((const __m128i *)(w + i));
        __m128i b1 = _mm_loadu_si128((const __m128i *)(w + i + 16));
        a0 = _mm256_fmadd_ps(_mm256_loadu_ps(x + i),
             _mm256_cvtepi32_ps(_mm256_cvtepi8_epi32(b0)), a0);
        a1 = _mm256_fmadd_ps(_mm256_loadu_ps(x + i + 8),
             _mm256_cvtepi32_ps(_mm256_cvtepi8_epi32(_mm_srli_si128(b0, 8))), a1);
        a2 = _mm256_fmadd_ps(_mm256_loadu_ps(x + i + 16),
             _mm256_cvtepi32_ps(_mm256_cvtepi8_epi32(b1)), a2);
        a3 = _mm256_fmadd_ps(_mm256_loadu_ps(x + i + 24),
             _mm256_cvtepi32_ps(_mm256_cvtepi8_epi32(_mm_srli_si128(b1, 8))), a3);
    }
    a0 = _mm256_add_ps(_mm256_add_ps(a0, a1), _mm256_add_ps(a2, a3));
    float acc = hsum256_ps(a0);
    for (; i < n; i++) acc += x[i] * (float)w[i];
    return acc;
}

static inline float dot_i16_i8(const int16_t *x, const int8_t *w, int n) {
    __m256 sum = _mm256_setzero_ps();
    int i = 0;
    for (; i + 32 <= n; i += 32) {
        __m256i x0 = _mm256_loadu_si256((const __m256i *)(x + i));
        __m256i x1 = _mm256_loadu_si256((const __m256i *)(x + i + 16));
        __m128i b0 = _mm_loadu_si128((const __m128i *)(w + i));
        __m128i b1 = _mm_loadu_si128((const __m128i *)(w + i + 16));
        __m256i d0 = _mm256_madd_epi16(x0, _mm256_cvtepi8_epi16(b0));
        __m256i d1 = _mm256_madd_epi16(x1, _mm256_cvtepi8_epi16(b1));
        sum = _mm256_add_ps(sum, _mm256_cvtepi32_ps(d0));
        sum = _mm256_add_ps(sum, _mm256_cvtepi32_ps(d1));
    }
    float acc = hsum256_ps(sum);
    for (; i < n; i++) acc += (float)x[i] * (float)w[i];
    return acc;
}

static float quantize_i16(const float *x, int16_t *q, int n) {
    float am = 0.f;
    for (int i = 0; i < n; i++) {
        float a = fabsf(x[i]);
        if (a > am) am = a;
    }
    float scale = am > 1e-20f ? am / 32767.f : 1.f;
    float inv = 1.f / scale;
    for (int i = 0; i < n; i++) q[i] = (int16_t)lrintf(x[i] * inv);
    return scale;
}

static void gemv_f32(float *y, const float *x, const int8_t *w,
                     const float *ws, int input, int output) {
#pragma omp parallel for schedule(static)
    for (int o = 0; o < output; o++)
        y[o] = dot_f32_i8(x, w + (int64_t)o * input, input) * ws[o];
}

static void gemv_i16(float *y, const int16_t *x, float xs, const int8_t *w,
                     const float *ws, int input, int output) {
#pragma omp parallel for schedule(static)
    for (int o = 0; o < output; o++)
        y[o] = dot_i16_i8(x, w + (int64_t)o * input, input) * (ws[o] * xs);
}

static void run_shape(Shape sh, int threads) {
    size_t wn = (size_t)sh.input * sh.output;
    float *x = xalloc((size_t)sh.input * sizeof(*x));
    int16_t *x16 = xalloc((size_t)sh.input * sizeof(*x16));
    int8_t *w = xalloc(wn);
    float *ws = xalloc((size_t)sh.output * sizeof(*ws));
    float *yf = xalloc((size_t)sh.output * sizeof(*yf));
    float *yi = xalloc((size_t)sh.output * sizeof(*yi));

    for (int i = 0; i < sh.input; i++) x[i] = sinf(i * 0.013f) * 1.7f + cosf(i * 0.007f) * 0.3f;
#pragma omp parallel for schedule(static)
    for (size_t i = 0; i < wn; i++) {
        uint32_t z = (uint32_t)i * 1664525u + 1013904223u;
        w[i] = (int8_t)((int)(z % 255u) - 127);
    }
    for (int o = 0; o < sh.output; o++) ws[o] = 0.001f + (o % 31) * 0.00003f;
    float xs = quantize_i16(x, x16, sh.input);

    gemv_f32(yf, x, w, ws, sh.input, sh.output);
    gemv_i16(yi, x16, xs, w, ws, sh.input, sh.output);
    double max_abs = 0, max_rel = 0;
    for (int o = 0; o < sh.output; o++) {
        double ae = fabs((double)yf[o] - yi[o]);
        double re = ae / fmax(1e-6, fabs((double)yf[o]));
        if (ae > max_abs) max_abs = ae;
        if (re > max_rel) max_rel = re;
    }

    double t0 = now_s();
    for (int r = 0; r < sh.reps; r++) gemv_f32(yf, x, w, ws, sh.input, sh.output);
    double tf = (now_s() - t0) / sh.reps;
    t0 = now_s();
    for (int r = 0; r < sh.reps; r++) gemv_i16(yi, x16, xs, w, ws, sh.input, sh.output);
    double ti = (now_s() - t0) / sh.reps;

    printf("%-12s I=%d O=%d weights=%.1f MiB threads=%d | f32 %.3f ms | i16 %.3f ms | speedup %.3fx | max_abs %.3g max_rel %.3g\n",
           sh.name, sh.input, sh.output, wn / 1048576.0, threads,
           tf * 1000.0, ti * 1000.0, tf / ti, max_abs, max_rel);
    free(x); free(x16); free(w); free(ws); free(yf); free(yi);
}

int main(int argc, char **argv) {
    int threads = argc > 1 ? atoi(argv[1]) : omp_get_max_threads();
    if (threads < 1) threads = 1;
    omp_set_dynamic(0);
    omp_set_num_threads(threads);
    Shape shapes[] = {
        {"expert-up", 2048, 8192, 20},
        {"expert-down", 512, 16384, 30},
        {"lm-head", 2048, 248320, 3},
    };
    for (size_t i = 0; i < sizeof(shapes) / sizeof(shapes[0]); i++) run_shape(shapes[i], threads);
    return 0;
}
