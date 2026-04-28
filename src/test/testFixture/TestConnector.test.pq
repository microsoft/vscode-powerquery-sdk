// Test file for integration tests
let
    Fact = (description as text, expected, actual) =>
        [description = description, expected = expected, actual = actual, passed = expected = actual],

    facts = {
        Fact("List has expected count", 5, List.Count({1, 2, 3, 4, 5})),
        Fact("FirstN returns correct result", {1}, List.FirstN({1, 2, 3}, 1))
    }
in
    facts
