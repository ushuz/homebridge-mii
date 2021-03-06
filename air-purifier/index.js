/*

MIT License

Copyright (c) 2017 Sei Kan
Copyright (c) 2021 John Hu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

const miio = require('miio');

let Service, Characteristic;

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory("MiAirPurifier2", MiAirPurifier2);
};

class MiAirPurifier2 {

  constructor(log, config, homebridge) {
    this.log = log;

    this.name = config.name || 'Air Purifier';
    this.address = config.address;
    this.token = config.token;

    if (!this.address) { throw new Error('MiAirPurifier2: missing address') };
    if (!this.token) { throw new Error('MiAirPurifier2: missing token') };

    // this.showAQI = config.showAQI || true;
    // this.showTemperature = config.showTemperature || true;
    // this.showHumidity = config.showHumidity || true;

    this.device = null;

    this.levels = [
      [200, Characteristic.AirQuality.POOR],
      [150, Characteristic.AirQuality.INFERIOR],
      [100, Characteristic.AirQuality.FAIR],
      [50,  Characteristic.AirQuality.GOOD],
      [0,   Characteristic.AirQuality.EXCELLENT],
    ];

    this.mode
    this.aqi
    this.temperature
    this.humidity

    this.airPurifierService = new Service.AirPurifier(this.name);
    this.airPurifierService
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getActiveState.bind(this))
      .on('set', this.setActiveState.bind(this));
    this.airPurifierService
      .getCharacteristic(Characteristic.CurrentAirPurifierState)
      .on('get', this.getCurrentAirPurifierState.bind(this));
    this.airPurifierService
      .getCharacteristic(Characteristic.TargetAirPurifierState)
      .on('get', this.getTargetAirPurifierState.bind(this))
      .on('set', this.setTargetAirPurifierState.bind(this));
    // this.airPurifierService
    //   .getCharacteristic(Characteristic.LockPhysicalControls)
    //   .on('get', this.getLockPhysicalControls.bind(this))
    //   .on('set', this.setLockPhysicalControls.bind(this));
    this.airPurifierService
      .getCharacteristic(Characteristic.RotationSpeed)
      .on('get', this.getRotationSpeed.bind(this))
      .on('set', this.setRotationSpeed.bind(this));

      this.airPurifierInfo = new Service.AccessoryInformation();
      this.airPurifierInfo
        .setCharacteristic(Characteristic.Manufacturer, 'Mi')
        .setCharacteristic(Characteristic.Model, 'Air Purifier 2')
        .setCharacteristic(Characteristic.SerialNumber, this.address);

      this.AQISensor = new Service.AirQualitySensor(this.name);
      this.AQISensor
        .getCharacteristic(Characteristic.AirQuality)
        .on('get', this.getAQI.bind(this));
      this.AQISensor
        .getCharacteristic(Characteristic.PM2_5Density)
        .on('get', this.getPM25.bind(this));

      this.temperatureSensor = new Service.TemperatureSensor(this.name);
      this.temperatureSensor
        .getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.getTemperature.bind(this));

      this.humiditySensor = new Service.HumiditySensor;
      this.humiditySensor
        .getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', this.getHumidity.bind(this));

      this.discover();
  }

  discover() {
    miio.device({ address: this.address, token: this.token })
        .then(device => {
          this.log(`discover: discovered at ${this.address}`)
          this.log.debug(`\
  miioModel:    ${device.miioModel}
  power:        ${device.property('power')}
  mode:         ${device.property('mode')}
  temperature:  ${device.property('temperature')}
  humidity:     ${device.property('humidity')}
  aqi:          ${device.property('aqi')}
  led:          ${device.property('led')}`)
          this.device = device;
          this.syncState();
        })
        .catch(err => {
          this.log.error(`discover: failed at ${this.address} with ${err}, retry in 30s`)
          setTimeout(() => { this.discover() }, 30 * 1000)
        })
  }

  syncState() {
    let device = this.device;
    device.on('modeChanged', mode => {
      this.updateActiveState(mode);
      this.updateTargetAirPurifierState(mode);
      this.updateCurrentAirPurifierState(mode);
    });
    device.on('pm2.5Changed', value => this.updateAQI(value));
    device.on('temperatureChanged', value => this.updateTemperature(parseFloat(value)));
    device.on('relativeHumidityChanged', value => this.updateHumidity(value));
  }

  getActiveState(callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }

    const state = (this.mode != 'idle') ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;

    this.log.debug('getActiveState: Mode -> %s', this.mode);
    this.log.debug('getActiveState: State -> %s', state);

    callback(null, state);
  }

  setActiveState(state, callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }

    this.log.debug('setActiveState: %s', state);

    this.device.setPower(state)
        .then(state => callback(null))
        .catch(err => callback(err));
  }

  updateActiveState(mode) {
    this.mode = mode;
    const state = (mode != 'idle') ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;

    this.log.debug('updateActiveState: Mode -> %s', mode);
    this.log.debug('updateActiveState: State -> %s', state);

    this.airPurifierService.getCharacteristic(Characteristic.Active).updateValue(state);
  }

  getCurrentAirPurifierState(callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }

    const state = (this.mode == 'idle') ? Characteristic.CurrentAirPurifierState.INACTIVE : Characteristic.CurrentAirPurifierState.PURIFYING_AIR;

    this.log.debug('getCurrentAirPurifierState: Mode -> %s', this.mode);
    this.log.debug('getCurrentAirPurifierState: State -> %s', state);

    callback(null, state);
  }

  updateCurrentAirPurifierState(mode) {
    this.mode = mode;
    const state = (mode == 'idle') ? Characteristic.CurrentAirPurifierState.INACTIVE : Characteristic.CurrentAirPurifierState.PURIFYING_AIR;

    this.log.debug('updateCurrentAirPurifierState: Mode ->  %s', mode);
    this.log.debug('updateCurrentAirPurifierState: State ->  %s', state);

    this.airPurifierService.getCharacteristic(Characteristic.CurrentAirPurifierState).updateValue(state);
  }

  getTargetAirPurifierState(callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }

    const state = this.mode !== 'favorite' ? Characteristic.TargetAirPurifierState.AUTO : Characteristic.TargetAirPurifierState.MANUAL;

    this.log.debug('getTargetAirPurifierState: Mode -> %s', this.mode);
    this.log.debug('getTargetAirPurifierState: State -> %s', state);

    callback(null, state);
  }

  setTargetAirPurifierState(state, callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }

    this.mode = state ? 'auto' : 'favorite';

    this.log.debug('setTargetAirPurifierState: %s', this.mode);

    this.device.setMode(this.mode)
        .then(mode => callback(null))
        .catch(err => callback(err));
  }

  updateTargetAirPurifierState(mode) {
    this.mode = mode;
    const state = mode !== 'favorite' ? Characteristic.TargetAirPurifierState.AUTO : Characteristic.TargetAirPurifierState.MANUAL;

    this.log.debug('updateTargetAirPurifierState: Mode -> %s', mode);
    this.log.debug('updateTargetAirPurifierState: State -> %s', state);

    this.airPurifierService.getCharacteristic(Characteristic.TargetAirPurifierState).updateValue(state);
  }

  async getLockPhysicalControls(callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }

    await this.device.call('get_prop', ['child_lock'])
        .then(result => {
            const state = result[0] === 'on' ? Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED : Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
            callback(null, state);
        })
        .catch(err => callback(err));
  }

  async setLockPhysicalControls(state, callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }

    await this.device.call('set_child_lock', [state ? 'on' : 'off'])
        .then(result => { result[0] === 'ok' ? callback(): callback(new Error(result[0])); })
        .catch(err => callback(err));
  }

  getRotationSpeed(callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }

    this.device.favoriteLevel()
      .then(level => {
            const speed = Math.ceil(level * 6.25);
            this.log.debug('getRotationSpeed: %s', speed);
            callback(null, speed);
        })
        .catch(err => callback(err));
  }

  setRotationSpeed(speed, callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }

    // overwirte to manual mode
    if (this.mode != 'favorite') {
        this.device.setMode('favorite')
            .then()
            .catch(err => callback(err));
    }

    // set favorite level
    const level = Math.ceil(speed / 6.25);

    this.log.debug('setRotationSpeed: %s', level);

    this.device.setFavoriteLevel(level)
        .then(level => callback(null))
        .catch(err => callback(err));
  }

  getPM25(callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }
    this.log.debug('getPM25: %s', this.aqi);
    callback(null, this.aqi);
  }

  getAQI(callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }
    this.log.debug('getAQI: %s', this.aqi);
    for (var item of this.levels) {
        if (this.aqi >= item[0]) {
          return callback(null, item[1]);
        }
    }
  }

  updateAQI(value) {
    this.aqi = value;
    this.log.debug('updateAQI: %s', value);
    for (var item of this.levels) {
        if (value >= item[0]) {
            return this.AQISensor.getCharacteristic(Characteristic.AirQuality).updateValue(item[1]);
        }
    }
  }

  getTemperature(callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }
    this.log.debug('getTemperature: %s', this.temperature);
    callback(null, this.temperature);
  }

  updateTemperature(value) {
    this.temperature = value;
    this.log.debug('updateTemperature: %s', value);
    this.temperatureSensor.getCharacteristic(Characteristic.CurrentTemperature).updateValue(value);
  }

  getHumidity(callback) {
    if (!this.device) { callback(new Error('MiAirPurifier2: no device')); return; }
    this.log.debug('getHumidity: %s', this.humidity);
    callback(null, this.humidity);
  }

  updateHumidity(value) {
    this.humidity = value;
    this.log.debug('updateHumidity: %s', value);
    this.humiditySensor.getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(value);
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(callback) { callback() }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices() {
    return [
      this.airPurifierService,
      this.airPurifierInfo,
      this.AQISensor,
      this.temperatureSensor,
      this.humiditySensor,
    ];
  }

}
