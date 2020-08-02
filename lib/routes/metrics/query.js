const SQL = require('@nearform/sql')

const metricsInsert = ({ event, os, version }) =>
  SQL`INSERT INTO metrics (date, event, os, version, value)
      VALUES (CURRENT_DATE, ${event}, ${os}, ${version}, 1)
      ON CONFLICT ON CONSTRAINT metrics_pkey
      DO UPDATE SET value = metrics.value + 1`

const metricsSelect = ({ metrics, startDate, endDate, summary }) => {
  const query = SQL`SELECT `

  if (summary) {
    query.append(SQL`event, SUM(value) AS "value" `)
  } else {
    query.append(SQL`date, event, os, version, value `)
  }

  query.append(
    SQL`FROM metrics WHERE date >= ${new Date(
      startDate
    )} AND date <= ${new Date(endDate)} `
  )

  if (metrics.length > 0) {
    query.append(SQL`AND event IN (`)
    query.append(
      SQL.glue(
        metrics.map(metric => SQL`${metric}`),
        ', '
      )
    )
    query.append(SQL`) `)
  }

  if (summary) {
    query.append(SQL`GROUP BY event`)
  }

  return query
}

module.exports = { metricsInsert, metricsSelect }
