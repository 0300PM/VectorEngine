cmake_minimum_required(VERSION 3.21)

project(vector_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(VEX_SOURCES
  src/flatten.cpp
  src/stroke.cpp
  src/protocol.cpp
  src/rasterizer.cpp
  src/renderer.cpp
  src/c_api.cpp
)

set(VEX_WARNINGS
  $<$<CXX_COMPILER_ID:GNU,Clang,AppleClang>:-Wall -Wextra -Wpedantic -Wconversion -Wshadow>
  $<$<CXX_COMPILER_ID:MSVC>:/W4 /permissive->
)

if(EMSCRIPTEN)
  add_executable(vector_engine ${VEX_SOURCES})
  target_include_directories(vector_engine PRIVATE include)
  target_compile_options(vector_engine PRIVATE ${VEX_WARNINGS})
  set_target_properties(vector_engine PROPERTIES SUFFIX ".js")
  target_link_options(vector_engine PRIVATE
    --no-entry
    -sWASM=1
    -sMODULARIZE=1
    -sEXPORT_ES6=1
    -sENVIRONMENT=web
    -sALLOW_MEMORY_GROWTH=1
    -sFILESYSTEM=0
    "-sEXPORTED_FUNCTIONS=_vex_protocol_version,_vex_renderer_create,_vex_renderer_destroy,_vex_renderer_render,_vex_renderer_pixels,_vex_renderer_width,_vex_renderer_height,_malloc,_free"
    "-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF64"
  )
else()
  add_library(vex STATIC ${VEX_SOURCES})
  target_include_directories(vex PUBLIC include)
  target_compile_options(vex PRIVATE ${VEX_WARNINGS})

  enable_testing()
  add_executable(vex_tests
    tests/main.cpp
    tests/geometry_test.cpp
    tests/flatten_test.cpp
    tests/stroke_test.cpp
    tests/protocol_test.cpp
    tests/rasterizer_test.cpp
    tests/renderer_test.cpp
    tests/c_api_test.cpp
  )
  target_link_libraries(vex_tests PRIVATE vex)
  target_compile_options(vex_tests PRIVATE ${VEX_WARNINGS})
  add_test(NAME vex_tests COMMAND vex_tests)
endif()
