#include <cstdio>
#include <exception>

#include "check.hpp"

namespace vex::test {

namespace {

int failures = 0;

}

std::vector<TestCase>& registry() {
  static std::vector<TestCase> cases;
  return cases;
}

int failure_count() { return failures; }

Registrar::Registrar(std::string_view name, std::function<void()> body) {
  registry().push_back({name, std::move(body)});
}

void expect(bool condition, std::string_view expression, std::source_location location) {
  if (condition) {
    return;
  }
  ++failures;
  std::printf("  FAILED %s:%u: %.*s\n", location.file_name(), location.line(),
              static_cast<int>(expression.size()), expression.data());
}

}

int main() {
  for (const auto& test_case : vex::test::registry()) {
    std::printf("[ RUN ] %.*s\n", static_cast<int>(test_case.name.size()), test_case.name.data());
    try {
      test_case.body();
    } catch (const std::exception& error) {
      vex::test::expect(false, error.what());
    }
  }
  std::printf("%zu test cases, %d failed checks\n", vex::test::registry().size(), vex::test::failure_count());
  return vex::test::failure_count() == 0 && !vex::test::registry().empty() ? 0 : 1;
}
