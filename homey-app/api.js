'use strict';

// Web API used by the settings page

module.exports = {
  async getSettingsInfo({ homey }) {
    return homey.app.getSettingsInfo();
  },
};
