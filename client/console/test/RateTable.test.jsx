import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RateTable from "../src/components/RateTable.jsx";

const ROWS = [
  { categoryCode: "PCB", nameEn: "Circuit board", unit: "KG", price: 190, lastUpdatedDays: 2, stale: false },
  { categoryCode: "CABLE", nameEn: "Cable", unit: "KG", price: 380, lastUpdatedDays: 9, stale: true },
  { categoryCode: "PANEL", nameEn: "Panel", defaultUnit: "PIECE", unit: "PIECE", price: null, lastUpdatedDays: null, stale: false },
];

describe("RateTable", () => {
  it("marks a rate older than seven days as stale", () => {
    render(<RateTable rows={ROWS} onPublish={() => {}} />);
    expect(screen.getByTestId("stale-CABLE")).toBeInTheDocument();
    expect(screen.queryByTestId("stale-PCB")).not.toBeInTheDocument();
  });

  it("publishes the edited rows as new values, not overwrites", () => {
    const onPublish = vi.fn();
    render(<RateTable rows={ROWS} onPublish={onPublish} />);
    fireEvent.change(screen.getByLabelText("price-PCB"), { target: { value: "205" } });
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    expect(onPublish).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ categoryCode: "PCB", price: 205, unit: "KG" })]),
    );
  });

  it("only sends rows the recycler actually set a price on", () => {
    const onPublish = vi.fn();
    render(<RateTable rows={ROWS} onPublish={onPublish} />);
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    const sent = onPublish.mock.calls[0][0];
    expect(sent.every((r) => r.price !== null && r.price !== "")).toBe(true);
    expect(sent.find((r) => r.categoryCode === "PANEL")).toBeUndefined();
  });

  it("copies existing rates into the editable fields on 'copy yesterday'", () => {
    render(<RateTable rows={ROWS} onPublish={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(screen.getByLabelText("price-PCB")).toHaveValue(190);
  });
});
