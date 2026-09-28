# [APP][Pro] Energy Dashboard – a live energy display for any screen in your home

Hi all,

I built an app that turns any screen in your home into a live energy dashboard. Homey Pro serves the dashboard as a web page on your own network, so a tablet on the wall, a laptop or your phone only needs a browser. You don't need an extra computer, a cloud account or an API key. There is also a widget for Homey's own Dashboards.

![Dashboard in dark mode](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/dashboard-dark.png)

## What it shows

The dashboard is made of blocks that you arrange yourself: drag them around, change their width and height, or hide them.

**Energy now**: the live flow between solar, grid, home and home battery. Moving particles show where the power goes; they speed up with more power.

![Energy now](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/energy-now.png)

**Power today**: the power through the day, in the style of the HomeWizard app. Solar you used yourself is at the bottom. Grid import is stacked on top of it, so its top edge is your consumption. Export is stacked the same way, so its top edge is everything your panels produced. The day's totals are at the top, and pointing at the chart shows the values at that moment. The last part of the line updates live. With the solar forecast turned on, a dashed line shows the expected solar power for today, plus the expected kWh for today and tomorrow.

![Power chart](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/power-chart.png)

**Energy flows**: a Sankey chart from your sources (solar, grid, battery) through the house to the individual devices, live in watts or for the chosen period in kWh.

![Energy flows](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/energy-flows.png)

**Costs, with your own contract**: a fixed contract (normal and off-peak rate) or a dynamic one. For dynamic contracts the price per hour is the market price plus energy tax plus your supplier's markup; pick your supplier to fill in its usual markup. Net metering (salderen) is taken into account until 2027. Costs are calculated with the price of each hour, so they match a dynamic contract. The costs block shows import, export, gas, water and fixed costs, compared with the previous period.

![Costs](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/costs.png)

![Prices](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/prices.png)

And more:
- Totals per day, week, month or year: consumption, import, solar, export, gas, water, self-sufficiency and costs, compared with the previous period
- Charts for electricity, solar, gas and water
- Hot water: temperature and estimated shower minutes of your water heater (made with the Atag Lydos Hybrid in mind)
- Heating, EV charger and home battery
- Use per device, standby use and phase load

It works in light and dark mode, on any screen size, in English and Dutch (switch at the top right).

![Light mode](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/dashboard-light.png)

<img src="https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/phone-nl.png" alt="On a phone" width="300">

## Widget for Homey Dashboards

The **Energy flows** widget shows live where your power comes from, which rooms use it, and the devices using the most per room. It is kept light: Homey only sends a small list of values and the widget draws them itself.

<img src="https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/widget.png" alt="Energy flows widget" width="400">

## For a tablet on the wall

With the screen icon at the top right, per screen:
- Full screen
- Keep the screen on
- Night mode: dim the screen or turn it black between two times; a tap wakes it for a minute. While it is black, the dashboard doesn't ask Homey for anything.

The page moves a few pixels now and then against burn-in, and reloads itself after an app update.

## How it works

- Devices are found automatically through Homey Energy: a P1 meter, solar panels, a home battery, a water heater, heating, an EV charger and a water meter. You can also pick them yourself in the app settings.
- History comes from Homey Insights. Market prices come from EnergyZero and the solar forecast from Forecast.Solar (both free, no account). Nothing about your usage leaves your network.
- The app settings show the address of the dashboard (by default `http://<homey-ip>:8080`).
- You can protect the dashboard with an access code, and editing the layout with a PIN.

## Requirements

- Homey Pro with Homey 12.3 or later
- A P1 meter for the live and power views; solar panels, a battery and the other devices are optional

## Feedback

This is the first release, so I'd love to hear how it works with your devices. If something isn't found or looks wrong, please post here or open an issue on GitHub:
https://github.com/WNijhof/homey-energy-dashboard/issues

Source code: https://github.com/WNijhof/homey-energy-dashboard
