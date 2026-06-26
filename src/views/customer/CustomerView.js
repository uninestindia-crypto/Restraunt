import { h, render } from 'preact';
import { CustomerApp } from './components/CustomerApp.jsx';

export class CustomerView {
  constructor(app) {
    this.app = app;
    this.container = null;
  }

  async mount(container) {
    this.container = container;
    render(h(CustomerApp, { app: this.app }), container);
  }

  unmount() {
    if (this.container) {
      render(null, this.container);
      this.container = null;
    }
  }
}
