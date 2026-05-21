import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Isolates a single WebGL scene's failure so the rest of the page keeps
 * working. A scene can fail to mount when the browser has run out of
 * WebGL contexts (sandboxed iframes have a low cap) or hits a GPU
 * driver hiccup. Without this boundary, one failure unmounts the whole
 * React tree and the dev runtime-error overlay covers the page.
 *
 * The fallback is an empty black div so the section reads as
 * "intentionally minimal" rather than broken; the headline numeral and
 * title (rendered by the parent section outside the boundary) are
 * unaffected.
 */
export default class SceneErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    // eslint-disable-next-line no-console
    console.warn('Scene failed to mount; rendering empty fallback.', error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return <div className="absolute inset-0 bg-black" />;
    }
    return this.props.children;
  }
}
