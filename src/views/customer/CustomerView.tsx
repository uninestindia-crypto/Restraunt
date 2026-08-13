import React from 'react';
import { createRoot } from 'react-dom/client';
import { CustomerApp } from './components/CustomerApp';
import { StorefrontErrorBoundary } from '../../components/StorefrontErrorBoundary';

export class CustomerView {
  // Fields these methods assign. Type-only: `declare` emits nothing, so the
  // runtime shape of the class is unchanged.
  declare app: any;
  declare container: any;
  declare root: any;

  constructor(app) {
    this.app = app;
    this.container = null;
    this.root = null;
  }

  async mount(container) {
    this.container = container;
    this.root = createRoot(container);
    this.root.render(
      <StorefrontErrorBoundary>
        <CustomerApp app={this.app} />
      </StorefrontErrorBoundary>
    );
  }

  unmount() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.container = null;
  }
}
