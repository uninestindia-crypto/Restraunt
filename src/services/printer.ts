// @ts-nocheck
/**
 * Web Bluetooth and Native Capacitor BLE thermal printer service.
 * Connects to BLE-based ESC/POS thermal printers and writes raw byte data.
 */

let BleClientModule = null;

async function getBleClient() {
  if (!BleClientModule) {
    const module = await import('@capacitor-community/bluetooth-le');
    BleClientModule = module.BleClient;
  }
  return BleClientModule;
}

class PrinterService {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this._isConnected = false;
    /** @type {((isConnected: boolean) => void)|null} */
    this.onStatusChange = null;
    // Native Capacitor connection details
    this.nativeConnection = null;
  }

  /** Whether the printer is currently connected. */
  get isConnected() {
    return this._isConnected;
  }

  /**
   * Request and connect to a BLE thermal printer.
   * @returns {Promise<boolean>} true on success
   */
  async connect() {
    const isCapacitor = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform();

    if (isCapacitor) {
      try {
        const client = await getBleClient();
        await client.initialize({ androidNeverForLocation: true });

        const uuids = [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
        ];

        const device = await client.requestDevice({
          services: uuids
        });

        this.device = device;

        await client.connect(device.deviceId, () => this._onDisconnected());

        const services = await client.getServices(device.deviceId);
        let foundChar = null;

        for (const service of services) {
          for (const char of service.characteristics) {
            if (char.properties?.write || char.properties?.writeWithoutResponse) {
              foundChar = {
                serviceUUID: service.uuid,
                characteristicUUID: char.uuid,
                writeWithoutResponse: !!char.properties?.writeWithoutResponse
              };
              break;
            }
          }
          if (foundChar) break;
        }

        if (!foundChar) {
          throw new Error('No writable characteristic found on printer');
        }

        this.nativeConnection = {
          deviceId: device.deviceId,
          serviceUUID: foundChar.serviceUUID,
          characteristicUUID: foundChar.characteristicUUID,
          writeWithoutResponse: foundChar.writeWithoutResponse
        };

        this._isConnected = true;
        if (this.onStatusChange) this.onStatusChange(true);
        return true;
      } catch (error) {
        console.error('Printer native connection failed:', error);
        this._isConnected = false;
        if (this.onStatusChange) this.onStatusChange(false);
        throw error;
      }
    } else {
      // Standard Web Bluetooth flow
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
  }

  /**
   * Disconnect the printer gracefully.
   */
  async disconnect() {
    const isCapacitor = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform();

    if (isCapacitor) {
      if (this.device && this.device.deviceId) {
        try {
          const client = await getBleClient();
          await client.disconnect(this.device.deviceId);
        } catch (e) {
          console.error('Failed to disconnect natively:', e);
        }
      }
      this._onDisconnected();
    } else {
      if (this.device && this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }
      this._onDisconnected();
    }
  }

  /** @private Handle disconnection cleanup. */
  _onDisconnected() {
    this._isConnected = false;
    this.characteristic = null;
    this.server = null;
    this.nativeConnection = null;
    if (this.onStatusChange) this.onStatusChange(false);
  }

  /**
   * Send raw ESC/POS data to the printer in BLE-safe chunks.
   * @param {Uint8Array} data - Raw ESC/POS byte data
   */
  async print(data) {
    const isCapacitor = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform();

    if (isCapacitor) {
      if (!this.nativeConnection) {
        throw new Error('Printer not connected');
      }
      const client = await getBleClient();
      const CHUNK_SIZE = 20;
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        const dataView = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        if (this.nativeConnection.writeWithoutResponse) {
          await client.writeWithoutResponse(
            this.nativeConnection.deviceId,
            this.nativeConnection.serviceUUID,
            this.nativeConnection.characteristicUUID,
            dataView
          );
        } else {
          await client.write(
            this.nativeConnection.deviceId,
            this.nativeConnection.serviceUUID,
            this.nativeConnection.characteristicUUID,
            dataView
          );
        }
        // Small delay between chunks for printer hardware buffer digestion
        if (i + CHUNK_SIZE < data.length) {
          await new Promise(resolve => setTimeout(resolve, 15));
        }
      }
    } else {
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
  }

  /**
   * Check if Web Bluetooth is supported in the current browser.
   * @returns {boolean}
   */
  isSupported() {
    if (typeof window === 'undefined') return false;
    const isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform();
    return !!(isCapacitor || navigator.bluetooth);
  }

  /**
   * Open native Android/iOS App settings for permission management.
   */
  async openAppSettings() {
    const isCapacitor = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform();
    if (isCapacitor) {
      try {
        const client = await getBleClient();
        await client.openAppSettings();
      } catch (e) {
        console.error('Failed to open app settings:', e);
      }
    }
  }
}

/** Singleton printer service instance. */
export const printerService = new PrinterService();
