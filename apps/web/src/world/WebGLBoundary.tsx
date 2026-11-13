import { Component, type ReactNode } from "react";

// No WebGL (old device, blocked GPU): show the fallback and keep the page
// usable instead of crashing it.
export class WebGLBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed
      ? (this.props.fallback ?? null)
      : this.props.children;
  }
}
