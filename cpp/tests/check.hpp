#pragma once

#include <cmath>
#include <functional>
#include <source_location>
#include <string_view>
#include <vector>

namespace vex::test {

struct TestCase {
  std::string_view name;
  std::function<void()> body;
};

[[nodiscard]] std::vector<TestCase>& registry();

[[nodiscard]] int failure_count();

struct Registrar {
  Registrar(std::string_view name, std::function<void()> body);
};

void expect(bool condition, std::string_view expression,
            std::source_location location = std::source_location::current());

[[nodiscard]] inline bool near(double actual, double expected, double tolerance = 1e-9) {
  return std::abs(actual - expected) <= tolerance;
}

}

#define VEX_TEST(name)                                                \
  static void name();                                                 \
  static const ::vex::test::Registrar name##_registrar(#name, &name); \
  static void name()

#define VEX_EXPECT(...) ::vex::test::expect((__VA_ARGS__), #__VA_ARGS__)
