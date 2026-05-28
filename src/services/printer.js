/**
 * Web Bluetooth thermal printer service.
 * Connects to BLE-based ESC/POS thermal printers and writes raw byte data.
 */
class PrinterService {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this._isConnected = false;
    /** @type {((isConnected: boolean) => void)|null} */
    this.onStatusChange = null;
  }

  /** Whether the printer is currently connected. */
  get isConnected() {
    return this._isConnected;
  }

  /**
   * Request and connect to a BLE thermal printer.
   * Opens the browser's Bluetooth device chooser dialog.
   * @returns {Promise<boolean>} true on success
   */
  async connect() {
    try {
      // Request BLE device with common thermal printer service UUIDs
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['000018f0-0000-1000-8000-00805f9b34fb'] },
          { namePrefix: 'Printer' },
          { namePrefix: 'BlueTooth' },
          { namePrefix: 'MTP' },
          { namePrefix: 'MPT' },
        ],
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
        ]
      });

      this.device.addEventListener('gattserverdisconnected', () => this._onDisconnected());

      // Connect to GATT server
      this.server = await this.device.gatt.connect();

      // Try to find a writable characteristic across all services
      const services = await this.server.getPrimaryServices();
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            this.characteristic = char;
            break;
          }
        }
        if (this.characteristic) break;
      }

      if (!this.characteristic) {
        throw new Error('No writable characteristic found on printer');
      }

      this._isConnected = true;
      if (this.onStatusChange) this.onStatusChange(true);
      return true;
    } catch (error) {
      console.error('Printer connection failed:', error);
      this._isConnected = false;
      if (this.onStatusChange) this.onStatusChange(false);
      throw error;
    }
  }

  /**
   * Disconnect the printer gracefully.
   */
  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this._onDisconnected();
  }

  /** @private Handle disconnection cleanup. */
  _onDisconnected() {
    this._isConnected = false;
    this.characteristic = null;
    this.server = null;
    if (this.onStatusChange) this.onStatusChange(false);
  }

  /**
   * Send raw ESC/POS data to the printer in BLE-safe chunks.
   * @param {Uint8Array} data - Raw ESC/POS byte data
   */
  async print(data) {
    if (!this.characteristic) {
      throw new Error('Printer not connected');
    }

    // BLE has a max write size (typically 20-40 bytes for standard MTU)
    // Send data in 20-byte chunks to prevent buffer overflow on typical BLE printer modules
    const CHUNK_SIZE = 20;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValue(chunk);
      }
      // Small delay between chunks for printer hardware buffer digestion
      if (i + CHUNK_SIZE < data.length) {
        await new Promise(resolve => setTimeout(resolve, 15));
      }
    }
  }

  /**
   * Check if Web Bluetooth is supported in the current browser.
   * @returns {boolean}
   */
  isSupported() {
    return !!navigator.bluetooth;
  }
}

/** Singleton printer service instance. */
export const printerService = new PrinterService();
