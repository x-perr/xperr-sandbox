import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QuickCaptureFab } from "../QuickCaptureFab";

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

test("renders FAB button", () => {
  render(<QuickCaptureFab />);
  expect(
    screen.getByRole("button", { name: /quick capture/i })
  ).toBeInTheDocument();
});

test("opens popover on FAB click", () => {
  render(<QuickCaptureFab />);
  fireEvent.click(screen.getByRole("button", { name: /quick capture/i }));
  expect(screen.getByPlaceholderText("Idea title...")).toBeInTheDocument();
});

test("closes popover on Escape", () => {
  render(<QuickCaptureFab />);
  fireEvent.click(screen.getByRole("button", { name: /quick capture/i }));
  fireEvent.keyDown(screen.getByPlaceholderText("Idea title..."), {
    key: "Escape",
  });
  expect(screen.queryByPlaceholderText("Idea title...")).not.toBeInTheDocument();
});

test("shows parent select when existingNodes provided", () => {
  const nodes = [{ id: "1", title: "Node A" }];
  render(<QuickCaptureFab existingNodes={nodes} />);
  fireEvent.click(screen.getByRole("button", { name: /quick capture/i }));
  expect(screen.getByRole("combobox", { name: /parent/i })).toBeInTheDocument();
  expect(screen.getByText("Node A")).toBeInTheDocument();
});

test("does not show parent select when no existing nodes", () => {
  render(<QuickCaptureFab />);
  fireEvent.click(screen.getByRole("button", { name: /quick capture/i }));
  expect(
    screen.queryByRole("combobox", { name: /parent/i })
  ).not.toBeInTheDocument();
});

test("submits node via POST and calls onNodeCreated", async () => {
  const created = { id: "new-1", title: "My Idea" };
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => created,
  } as Response);

  const onNodeCreated = jest.fn();
  render(<QuickCaptureFab onNodeCreated={onNodeCreated} />);

  fireEvent.click(screen.getByRole("button", { name: /quick capture/i }));
  fireEvent.change(screen.getByPlaceholderText("Idea title..."), {
    target: { value: "My Idea" },
  });
  fireEvent.click(screen.getByRole("button", { name: /add idea/i }));

  await waitFor(() => {
    expect(onNodeCreated).toHaveBeenCalledWith(created);
  });

  expect(mockFetch).toHaveBeenCalledWith("/api/vision/nodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "My Idea" }),
  });
});

test("submits with parentId when selected", async () => {
  const created = { id: "new-2", title: "Child", parentId: "p1" };
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => created,
  } as Response);

  const nodes = [{ id: "p1", title: "Parent" }];
  render(<QuickCaptureFab existingNodes={nodes} />);

  fireEvent.click(screen.getByRole("button", { name: /quick capture/i }));
  fireEvent.change(screen.getByPlaceholderText("Idea title..."), {
    target: { value: "Child" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: /parent/i }), {
    target: { value: "p1" },
  });
  fireEvent.click(screen.getByRole("button", { name: /add idea/i }));

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith("/api/vision/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Child", parentId: "p1" }),
    });
  });
});

test("calls onError when fetch fails", async () => {
  mockFetch.mockResolvedValue({
    ok: false,
    status: 500,
  } as Response);

  const onError = jest.fn();
  render(<QuickCaptureFab onError={onError} />);

  fireEvent.click(screen.getByRole("button", { name: /quick capture/i }));
  fireEvent.change(screen.getByPlaceholderText("Idea title..."), {
    target: { value: "Test" },
  });
  fireEvent.click(screen.getByRole("button", { name: /add idea/i }));

  await waitFor(() => {
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

test("disables submit when title is empty", () => {
  render(<QuickCaptureFab />);
  fireEvent.click(screen.getByRole("button", { name: /quick capture/i }));
  expect(screen.getByRole("button", { name: /add idea/i })).toBeDisabled();
});
