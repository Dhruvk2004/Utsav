import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import { focusById } from "@/components/ui/focus";

/** focusById waits for the element a re-render brings in (CO-01), and gives up quietly. */

function Late() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 20);
    return () => clearTimeout(timer);
  }, []);
  return shown ? <button id="late">Late</button> : null;
}

describe("focusById", () => {
  it("focuses an element that appears a few frames later", async () => {
    render(<Late />);
    focusById("late");
    await waitFor(() => expect(screen.getByRole("button", { name: "Late" })).toHaveFocus());
  });

  it("does nothing when the element never appears", async () => {
    render(<button>Stay</button>);
    screen.getByRole("button", { name: "Stay" }).focus();
    focusById("missing", 1);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.getByRole("button", { name: "Stay" })).toHaveFocus();
  });
});
