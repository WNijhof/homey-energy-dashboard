'use strict';

// Web API used by the settings page

module.exports = {
  async getSettingsInfo({ homey }) {
    return homey.app.getSettingsInfo();
  },
  // The anonymous diagnosis a user can share from the settings
  async getDiagnosisReport({ homey, query }) {
    return homey.app.getDiagnosisReport({ snapshot: query?.snapshot === '1' });
  },
  // A meter export (CSV) for the battery size block, sent in parts
  async importNights({ homey, body }) {
    return homey.app.importNightsPart(body || {});
  },
  async clearNightImport({ homey }) {
    return homey.app.clearNightImport();
  },
};
