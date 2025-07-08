# Testing Patterns Guide

This document provides guidance for writing tests in the Power Query SDK extension, based on the patterns established during the test framework migration.

## Test Architecture Overview

The project uses a **unit-first testing philosophy** with the following hierarchy:

1. **Unit Tests** (80% target): Pure business logic, no external dependencies
2. **Integration Tests** (20% target): VS Code API interactions, minimal and focused

## Unit Testing Patterns

### 1. Property-Based Testing

Use property-based testing for validation logic and business rules.

```typescript
describe("Property-Based Testing - Validation Rules", () => {
    it("should always validate valid inputs regardless of case", () => {
        for (let i = 0; i < 100; i++) {
            const validInput = generateValidInput();
            const result = ValidationService.validate(validInput);
            expect(result.isValid).to.equal(true, `Valid input should pass: "${validInput}"`);
        }
    });
});
```

**Key Principles:**

- Generate random valid/invalid data to test business rules
- Test mathematical properties (idempotence, commutativity, etc.)
- Verify invariants hold across different input variations
- Use at least 50-100 iterations for robust coverage

### 2. Performance Testing

Include performance tests with realistic thresholds for critical operations.

```typescript
describe("Performance Testing", () => {
    it("should handle operations quickly under load", () => {
        const startTime = Date.now();
        const iterations = 1000;

        for (let i = 0; i < iterations; i++) {
            const result = CriticalService.performOperation(`input${i}`);
            expect(result).to.be.defined;
        }

        const duration = Date.now() - startTime;
        expect(duration).to.be.lessThan(100, `${iterations} operations took ${duration}ms, should be < 100ms`);
    });
});
```

**Guidelines:**

- Set realistic performance thresholds based on user expectations
- Test both success and failure scenarios
- Include concurrent operation testing for shared resources
- Document performance expectations in test descriptions

### 3. Edge Case Testing

Systematically test boundary conditions and edge cases.

```typescript
describe("Edge Case Testing", () => {
    it("should handle boundary conditions correctly", () => {
        const edgeCases = [
            { input: "", expected: false, reason: "empty string" },
            { input: "a".repeat(255), expected: true, reason: "max length" },
            { input: "a".repeat(256), expected: false, reason: "over max length" },
            { input: "🚀💻📊", expected: false, reason: "unicode characters" },
        ];

        for (const testCase of edgeCases) {
            const result = ValidationService.validate(testCase.input);
            expect(result.isValid).to.equal(testCase.expected, `${testCase.reason}: "${testCase.input}"`);
        }
    });
});
```

**Areas to Test:**

- Boundary values (0, 1, max length, max integer)
- Empty/null/undefined inputs
- Unicode and special characters
- Very large datasets
- Concurrent access scenarios

### 4. Service Testing with Dependency Injection

Test services by mocking their dependencies using Sinon.

```typescript
describe("ServiceClass", () => {
    let mockDependency: Partial<IDependencyService>;
    let service: ServiceClass;

    beforeEach(() => {
        mockDependency = {
            performOperation: sinon.stub(),
        };
        service = new ServiceClass(mockDependency as IDependencyService);
    });

    it("should handle successful operations", async () => {
        // Arrange
        const expectedResult = { success: true, data: "test" };
        (mockDependency.performOperation as sinon.SinonStub).resolves(expectedResult);

        // Act
        const result = await service.execute({ input: "test" });

        // Assert
        expect(result.success).to.equal(true);
        expect(mockDependency.performOperation).to.have.been.calledOnceWith("test");
    });
});
```

**Best Practices:**

- Mock all external dependencies
- Test both success and failure scenarios
- Verify method calls with specific parameters
- Use typed mocks with Partial<Interface> pattern

## Test Organization

### Directory Structure

```
unit-tests/
├── commands/handlers/          # Command handler tests
├── validation/                 # Validation logic tests
├── services/                  # Service class tests
├── common/                    # Utility and common logic tests
└── utils/                     # Test utilities and helpers
```

### Naming Conventions

- Test files: `*.spec.ts`
- Test suites: Match the class/module being tested
- Test cases: Use descriptive "should" statements
- Test data: Use meaningful variable names

### Test Structure

Follow the **Arrange-Act-Assert** pattern:

```typescript
it("should return success result when operation succeeds", async () => {
    // Arrange
    const input = { value: "test" };
    const expectedOutput = { success: true };
    mockService.performOperation.resolves(expectedOutput);

    // Act
    const result = await handler.execute(input);

    // Assert
    expect(result.success).to.equal(true);
    expect(result.data).to.deep.equal(expectedOutput);
});
```

## Service Abstraction Patterns

### Creating Testable Services

Extract business logic into services with clear interfaces:

```typescript
// Interface for dependency injection
export interface IDataProcessor {
    processData(input: string): Promise<ProcessResult>;
}

// Implementation with dependencies
export class DataProcessor implements IDataProcessor {
    constructor(
        private readonly fileSystem: IFileSystem,
        private readonly validator: IValidator,
    ) {}

    async processData(input: string): Promise<ProcessResult> {
        // Pure business logic - easily testable
        const validationResult = this.validator.validate(input);
        if (!validationResult.isValid) {
            return { success: false, error: validationResult.error };
        }

        const data = await this.fileSystem.readFile(input);
        return { success: true, data: this.transformData(data) };
    }

    private transformData(data: string): string {
        // Pure function - easily unit tested
        return data.trim().toUpperCase();
    }
}
```

### Handling VS Code Dependencies

For code that requires VS Code APIs:

1. **Abstract the VS Code dependency** behind an interface
2. **Use integration tests** for VS Code-specific functionality
3. **Extract pure business logic** into separate, testable functions

```typescript
// Abstract VS Code interactions
export interface IUIService {
    showInformationMessage(message: string): Promise<void>;
    showErrorMessage(message: string): Promise<void>;
}

// Business logic remains testable
export class NotificationService {
    constructor(private readonly ui: IUIService) {}

    async notifyResult(result: OperationResult): Promise<void> {
        const message = this.formatMessage(result); // Pure function - testable

        if (result.success) {
            await this.ui.showInformationMessage(message);
        } else {
            await this.ui.showErrorMessage(message);
        }
    }

    private formatMessage(result: OperationResult): string {
        // Pure business logic - unit testable
        return result.success ? `Operation completed: ${result.data}` : `Operation failed: ${result.error}`;
    }
}
```

## Common Anti-Patterns to Avoid

### ❌ Testing Implementation Details

```typescript
// Bad - testing internal state
expect(service.internalCache.size).to.equal(1);

// Good - testing observable behavior
expect(await service.getData("key")).to.equal(expectedValue);
```

### ❌ Overly Complex Test Setup

```typescript
// Bad - complex, brittle setup
beforeEach(() => {
    // 50 lines of setup code...
});

// Good - focused, minimal setup
beforeEach(() => {
    mockService = { operation: sinon.stub() };
    service = new ServiceUnderTest(mockService);
});
```

### ❌ Testing Multiple Concerns

```typescript
// Bad - testing multiple behaviors
it("should validate input and save to database and send notification", () => {
    // Tests too many things at once
});

// Good - focused single concern
it("should validate input correctly", () => {
    // Tests only validation logic
});
```

## Performance Thresholds

Use these baseline thresholds for performance tests:

- **Validation operations**: < 1ms per operation
- **File operations**: < 10ms per file
- **Network operations**: < 100ms per request (mocked)
- **Bulk operations**: 1000+ operations < 100ms
- **Memory usage**: No significant leaks in 1000+ operation tests

## Test Data Generation

### Random Data Generators

Create reusable data generators for property-based testing:

```typescript
function generateValidProjectName(): string {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const validChars = letters + "0123456789_";

    let name = letters[Math.floor(Math.random() * letters.length)];
    const length = Math.floor(Math.random() * 50) + 1;

    for (let i = 0; i < length; i++) {
        name += validChars[Math.floor(Math.random() * validChars.length)];
    }

    return name;
}
```

### Edge Case Test Data

Maintain collections of edge case test data:

```typescript
const EDGE_CASE_STRINGS = [
    "", // Empty
    " ", // Whitespace
    "a".repeat(1000), // Very long
    "🚀💻📊", // Unicode
    "test\n\r\t", // Control characters
    null as any, // Null
    undefined as any, // Undefined
];
```

## Debugging Test Failures

### Common Test Failure Patterns

1. **Flaky Tests**: Usually timing or dependency issues
    - Add proper awaits for async operations
    - Mock time-dependent operations
    - Use deterministic test data

2. **Brittle Tests**: Tests break with minor code changes
    - Test behavior, not implementation
    - Use meaningful assertions
    - Avoid testing private methods directly

3. **Slow Tests**: Tests take too long to run
    - Mock external dependencies
    - Use smaller test data sets
    - Parallelize independent tests

### Test Debugging Tools

```typescript
// Add detailed failure messages
expect(result.isValid).to.equal(true, `Validation failed for: "${input}" - ${result.error}`);

// Log test data for debugging
console.log(`Testing with input: ${JSON.stringify(testData)}`);

// Use Sinon call history for debugging
console.log("Mock was called with:", mockService.method.getCall(0).args);
```

## Continuous Improvement

### Test Metrics to Track

- Test count and coverage
- Test execution time
- Test failure rates
- Performance benchmark trends

### Regular Review Practices

- Review test failures for patterns
- Update performance thresholds based on real usage
- Refactor tests when they become hard to maintain
- Add property-based tests for new validation logic

This testing approach ensures reliable, maintainable, and fast-running tests that provide confidence in code changes while supporting rapid development.
