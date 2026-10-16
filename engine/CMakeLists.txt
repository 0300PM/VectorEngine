cmake_minimum_required(VERSION 3.24)

project(vector_engine VERSION 0.1.0 LANGUAGES CXX)

option(VECTOR_ENGINE_BUILD_TESTS "Build native tests" ON)
option(VECTOR_ENGINE_BUILD_CLI "Build command line interface" ON)
option(VECTOR_ENGINE_BUILD_WASM "Build WebAssembly bindings" OFF)

include(FetchContent)

FetchContent_Declare(
    nlohmann_json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
    GIT_SHALLOW TRUE
)

FetchContent_Declare(
    stb
    GIT_REPOSITORY https://github.com/nothings/stb.git
    GIT_TAG f0569113c93ad095470c54bf34a17b36646bbbb5
)

FetchContent_MakeAvailable(nlohmann_json stb)

add_library(vector_engine_core
    src/core/engine.cpp
    src/json/parser.cpp
    src/geometry/path.cpp
    src/geometry/transform.cpp
    src/scene/types.cpp
    src/svg/svg_renderer.cpp
    src/raster/rasterizer.cpp
    src/encoders/encoders.cpp
    src/encoders/stb_image_write.cpp
)

add_library(vector_engine::core ALIAS vector_engine_core)
set_target_properties(vector_engine_core PROPERTIES EXPORT_NAME core)

target_compile_features(vector_engine_core PUBLIC cxx_std_23)
target_include_directories(vector_engine_core
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
)
target_include_directories(vector_engine_core SYSTEM PRIVATE ${stb_SOURCE_DIR})
target_link_libraries(vector_engine_core PRIVATE $<BUILD_INTERFACE:nlohmann_json::nlohmann_json>)

if(MSVC)
    target_compile_options(vector_engine_core PRIVATE /W4 /permissive-)
else()
    target_compile_options(vector_engine_core PRIVATE -Wall -Wextra -Wpedantic -Wconversion -Wshadow)
endif()

if(VECTOR_ENGINE_BUILD_CLI AND NOT EMSCRIPTEN)
    add_executable(vector-engine src/cli/main.cpp)
    target_link_libraries(vector-engine PRIVATE vector_engine::core)
    target_compile_features(vector-engine PRIVATE cxx_std_23)
endif()

if((VECTOR_ENGINE_BUILD_WASM OR EMSCRIPTEN) AND EMSCRIPTEN)
    add_executable(vector_engine_wasm src/bindings/wasm.cpp)
    target_link_libraries(vector_engine_wasm PRIVATE vector_engine::core nlohmann_json::nlohmann_json)
    target_compile_features(vector_engine_wasm PRIVATE cxx_std_23)
    set_target_properties(vector_engine_wasm PROPERTIES
        OUTPUT_NAME vector_engine
        SUFFIX ".js"
    )
    target_link_options(vector_engine_wasm PRIVATE
        --bind
        -sMODULARIZE=1
        -sEXPORT_NAME=createVectorEngineModule
        -sENVIRONMENT=web,worker
        -sALLOW_MEMORY_GROWTH=1
        -sFILESYSTEM=0
        -sDYNAMIC_EXECUTION=0
        -sASSERTIONS=0
        -sNO_EXIT_RUNTIME=1
    )
    set(WASM_OUTPUT_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../apps/web/public/wasm)
    add_custom_command(TARGET vector_engine_wasm POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory ${WASM_OUTPUT_DIR}
        COMMAND ${CMAKE_COMMAND} -E copy_if_different $<TARGET_FILE:vector_engine_wasm> ${WASM_OUTPUT_DIR}/vector_engine.js
        COMMAND ${CMAKE_COMMAND} -E copy_if_different $<TARGET_FILE_DIR:vector_engine_wasm>/vector_engine.wasm ${WASM_OUTPUT_DIR}/vector_engine.wasm
    )
endif()

if(VECTOR_ENGINE_BUILD_TESTS AND NOT EMSCRIPTEN)
    enable_testing()
    FetchContent_Declare(
        Catch2
        GIT_REPOSITORY https://github.com/catchorg/Catch2.git
        GIT_TAG v3.7.1
        GIT_SHALLOW TRUE
    )
    FetchContent_MakeAvailable(Catch2)
    add_executable(vector_engine_tests
        tests/parser_test.cpp
        tests/path_test.cpp
        tests/svg_test.cpp
        tests/raster_test.cpp
        tests/encoder_test.cpp
    )
    target_link_libraries(vector_engine_tests PRIVATE vector_engine::core Catch2::Catch2WithMain)
    target_compile_features(vector_engine_tests PRIVATE cxx_std_23)
    include(Catch)
    catch_discover_tests(vector_engine_tests)
endif()

include(GNUInstallDirs)
install(TARGETS vector_engine_core EXPORT vector_engine_targets)
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
install(EXPORT vector_engine_targets
    FILE vector_engine_targets.cmake
    NAMESPACE vector_engine::
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/vector_engine
)
