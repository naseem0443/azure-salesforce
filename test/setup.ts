import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock the react-router-dom navigate function
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn()
  };
});

// Emulate global fetch since node environment might require it
if (!globalThis.fetch) {
  (globalThis as any).fetch = vi.fn();
}
