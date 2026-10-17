#include <jni.h>
#include <android/log.h>
#include <unistd.h>
#include <cstdlib>
#include <cstring>
#include <string>
#include <thread>
#include <vector>
#include "node.h"

// Starts one embedded Node runtime; Java owns its lifetime and writable directory.
static void redirectLogs() {
    int descriptors[2];
    if (pipe(descriptors) != 0) return;
    setvbuf(stdout, nullptr, _IOLBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    dup2(descriptors[1], STDOUT_FILENO);
    dup2(descriptors[1], STDERR_FILENO);
    close(descriptors[1]);
    std::thread([fd = descriptors[0]] {
        char buffer[2048];
        ssize_t length;
        while ((length = read(fd, buffer, sizeof(buffer) - 1)) > 0) {
            buffer[length] = '\0';
            __android_log_write(ANDROID_LOG_INFO, "FoliaBackend", buffer);
        }
        close(fd);
    }).detach();
}

extern "C" JNIEXPORT jint JNICALL
Java_top_izuna_foliamajor_BackendRuntime_startNode(JNIEnv* env, jclass, jobjectArray arguments) {
    const auto count = env->GetArrayLength(arguments);
    std::vector<std::string> strings;
    size_t total = 0;
    for (jsize i = 0; i < count; ++i) {
        auto item = static_cast<jstring>(env->GetObjectArrayElement(arguments, i));
        const char* value = env->GetStringUTFChars(item, nullptr);
        strings.emplace_back(value);
        total += strings.back().size() + 1;
        env->ReleaseStringUTFChars(item, value);
        env->DeleteLocalRef(item);
    }
    // libuv requires contiguous argv storage.
    std::vector<char> storage(total);
    std::vector<char*> argv(count);
    char* cursor = storage.data();
    for (jsize i = 0; i < count; ++i) {
        argv[i] = cursor;
        std::memcpy(cursor, strings[i].c_str(), strings[i].size() + 1);
        cursor += strings[i].size() + 1;
    }
    redirectLogs();
    return node::Start(count, argv.data());
}
