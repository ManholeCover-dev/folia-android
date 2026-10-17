cmake_minimum_required(VERSION 3.22.1)
project(folia_node)

# The mobile runtime is downloaded and SHA-256 checked by android:runtime.
add_library(node SHARED IMPORTED)
set_target_properties(node PROPERTIES IMPORTED_LOCATION "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../packaging/android/runtime/lib/${ANDROID_ABI}/libnode.so")
add_library(folia_node SHARED nodeBridge.cpp)
target_compile_features(folia_node PRIVATE cxx_std_20)
target_include_directories(folia_node PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../packaging/android/runtime/include")
target_link_libraries(folia_node node log)
target_link_options(folia_node PRIVATE "-Wl,-z,max-page-size=16384")
