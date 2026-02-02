import React, { useState, useRef, useEffect } from "react";

export interface VisionNode {
  id: string;
  title: string;
  parentId?: string;
}

export interface QuickCaptureFabProps {
  existingNodes?: VisionNode[];
  apiEndpoint?: string;
  onNodeCreated?: (node: VisionNode) => void;
  onError?: (error: Error) => void;
}

export function QuickCaptureFab({
  existingNodes = [],
  apiEndpoint = "/api/vision/nodes",
  onNodeCreated,
  onError,
}: QuickCaptureFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const body: Record<string, string> = { title: trimmed };
      if (parentId) body.parentId = parentId;

      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Failed to create node: ${res.status}`);
      }

      const node: VisionNode = await res.json();
      onNodeCreated?.(node);
      setTitle("");
      setParentId("");
      setIsOpen(false);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div style={styles.container} ref={popoverRef} onKeyDown={handleKeyDown}>
      {isOpen && (
        <form onSubmit={handleSubmit} style={styles.popover}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Idea title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={styles.input}
            disabled={isSubmitting}
            aria-label="Idea title"
          />
          {existingNodes.length > 0 && (
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              style={styles.select}
              disabled={isSubmitting}
              aria-label="Parent node"
            >
              <option value="">No parent</option>
              {existingNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.title}
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            disabled={!title.trim() || isSubmitting}
            style={{
              ...styles.submitButton,
              opacity: !title.trim() || isSubmitting ? 0.5 : 1,
            }}
          >
            {isSubmitting ? "Adding..." : "Add Idea"}
          </button>
        </form>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          ...styles.fab,
          transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
        }}
        aria-label={isOpen ? "Close quick capture" : "Quick capture new idea"}
        aria-expanded={isOpen}
      >
        +
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    bottom: 24,
    right: 24,
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 12,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: "none",
    backgroundColor: "#6366f1",
    color: "white",
    fontSize: 28,
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    transition: "transform 0.2s ease, background-color 0.2s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  popover: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: 280,
  },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    outline: "none",
  },
  select: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    backgroundColor: "white",
  },
  submitButton: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#6366f1",
    color: "white",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
};
