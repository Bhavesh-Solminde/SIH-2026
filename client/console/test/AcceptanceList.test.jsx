import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AcceptanceList from "../src/components/AcceptanceList.jsx";

const ROWS = [
  {
    id: "a1",
    collectorId: "018f-collector",
    categoryCode: "PCB",
    quantity: 3,
    unit: "KG",
    estimatedValue: 1260,
    acceptedRate: 420,
    acceptedTs: "2026-09-02T10:15:00+05:30",
    recyclerResponse: "NONE",
  },
];

describe("AcceptanceList", () => {
  it("states that inaction still means the collector arrives", () => {
    render(<AcceptanceList rows={ROWS} inactionMeans="collector_arrives_as_planned" onRespond={() => {}} />);
    expect(screen.getByText(/arrives as planned/i)).toBeInTheDocument();
  });

  it("shows the pseudonymous collector id and never a name or phone", () => {
    render(<AcceptanceList rows={ROWS} onRespond={() => {}} />);
    expect(screen.getByText(/018f-collector/)).toBeInTheDocument();
    expect(screen.queryByText(/phone/i)).not.toBeInTheDocument();
  });

  it("acknowledges a row", () => {
    const onRespond = vi.fn();
    render(<AcceptanceList rows={ROWS} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole("button", { name: /acknowledge/i }));
    expect(onRespond).toHaveBeenCalledWith("a1", "ACKNOWLEDGED");
  });

  it("declines a row", () => {
    const onRespond = vi.fn();
    render(<AcceptanceList rows={ROWS} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    expect(onRespond).toHaveBeenCalledWith("a1", "DECLINED");
  });
});
