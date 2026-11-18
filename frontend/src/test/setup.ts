/// <reference types="@testing-library/jest-dom/vitest" />
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";

// Register the jest-dom matchers (toBeInTheDocument, ...) on this file's own `expect`.
// Importing "@testing-library/jest-dom/vitest" does the same, but from inside node_modules it can get a
// different copy of `expect` than the tests use, which intermittently left the matchers missing
// ("Invalid Chai property: toBeInTheDocument").
expect.extend(matchers);

// Unmount rendered components after every test
afterEach(() => cleanup());
