import React from 'react';

/**
 * Keeps one bad record from white-screening the storefront.
 *
 * The customer app renders whatever the cloud pushes into the local catalogue.
 * Before this boundary existed, a single malformed menu row threw during
 * render and React unmounted the whole tree, leaving a customer staring at a
 * blank page with no way back.
 */
export class StorefrontErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  declare props: { children?: any };
  declare state: { error: any };

  componentDidCatch(error, info) {
    console.error('[Storefront] Render failed:', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="storefront-error" role="alert">
        <span className="material-symbols-rounded" aria-hidden="true">restaurant</span>
        <h1>We could not load the menu</h1>
        <p>
          Something went wrong while showing this page. Your cart is safe — reloading usually
          fixes it.
        </p>
        <div className="storefront-error-actions">
          <button type="button" onClick={this.handleReload}>Reload the page</button>
          <a href="/menu">View the menu</a>
        </div>
      </div>
    );
  }
}
