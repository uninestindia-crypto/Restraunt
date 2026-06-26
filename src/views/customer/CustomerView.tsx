// @ts-nocheck
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CustomerApp } from './components/CustomerApp';

export class CustomerView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.root = null;
  }

  async mount(container) {
    this.container = container;
    this.root = createRoot(container);
    this.root.render(<CustomerApp app={this.app} />);
  }

  unmount() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.container = null;
  }
}
