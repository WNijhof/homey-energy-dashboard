'use strict';

// Web API used by the settings page

module.exports = {
  async getSettingsInfo({ homey }) {
    return homey.app.getSettingsInfo();
  },
  // The anonymous diagnosis a user can share from the settings
  async getDiagnosisReport({ homey }) {
    return homey.app.getDiagnosisReport();
  },
};
