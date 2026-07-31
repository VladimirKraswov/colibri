#define QWEN36_NO_MAIN 1
#include "../qwen36.c"

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "usage: %s tokenizer.json\n", argv[0]);
        return 2;
    }
    static const char prompt[] =
        "<|im_start|>system\nОтвечай кратко и точно.<|im_end|>\n"
        "<|im_start|>user\nНазови столицу Франции и реку, на которой она стоит.<|im_end|>\n"
        "<|im_start|>assistant\n<think>\n";
    static const int expected[] = {
        248045, 8678, 198, 57516, 5301, 53887, 148390, 233996, 7347,
        175144, 13, 248046, 198, 248045, 846, 198, 81573, 148675, 1739,
        168151, 3652, 198479, 7347, 148309, 34083, 11, 12696, 171494,
        170388, 170978, 13, 248046, 198, 248045, 74455, 198, 248068, 198,
    };

    load_tokenizer(argv[1]);
    int *ids = NULL, n = 0;
    encode_text(prompt, &ids, &n);
    int ok = n == (int)(sizeof expected / sizeof expected[0]);
    for (int i = 0; ok && i < n; i++) ok = ids[i] == expected[i];
    if (!ok) {
        fprintf(stderr, "token mismatch: got %d\n", n);
        for (int i = 0; i < n; i++) fprintf(stderr, "%d%s", ids[i], i + 1 == n ? "\n" : ", ");
        free(ids);
        return 1;
    }
    free(ids);
    puts("qwen36 tokenizer parity: PASS (38/38 ids)");
    return 0;
}
