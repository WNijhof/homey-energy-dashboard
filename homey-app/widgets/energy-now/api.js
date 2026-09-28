'use strict';

// Data for the Energy now widget

module.exports = {
  async getNow({ homey }) {
    return homey.app.getWidgetNow();
  },
};
