const SQL = require('@nearform/sql')

const metricsInsert = ({ event, os, timeZone, version }) =>
  SQL`INSERT INTO metrics (date, event, os, version, value)
      VALUES ((CURRENT_TIMESTAMP AT TIME ZONE ${timeZone})::DATE, ${event}, ${os}, ${version}, 1)
      ON CONFLICT ON CONSTRAINT metrics_pkey
      DO UPDATE SET value = metrics.value + 1`

const metricsSelect = ({
  metrics,
  startDate,
  endDate,
  summary,
  daily,
  optimiseContacts
}) => {
  let correctContactNotifications = false
  if (
    optimiseContacts &&
    (metrics.length === 0 || metrics.indexOf('CONTACT_NOTIFICATION') > -1)
  ) {
    correctContactNotifications = true
  }
  const query = SQL`SELECT * FROM (SELECT `

  if (summary) {
    query.append(SQL`event, SUM(value) AS "value"`)
  } else if (daily) {
    query.append(SQL`date, event, SUM(value) AS "value"`)
  } else {
    query.append(SQL`date, event, os, version, value`)
  }

  query.append(
    SQL` FROM metrics WHERE date >= ${new Date(
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
    query.append(SQL`)`)
  }
  if (correctContactNotifications) {
    query.append(
      SQL` AND event NOT IN ('CONTACT_NOTIFICATION', 'CALLBACK_REQUEST') `
    )
  }

  if (summary) {
    query.append(SQL` GROUP BY event `)
  } else if (daily) {
    query.append(SQL` GROUP BY event, date `)
  }
  if (correctContactNotifications) {
    query.append(SQL`UNION SELECT `)
    if (summary) {
      query.append(SQL`event, SUM(value) AS "value" `)
    } else if (daily) {
      query.append(SQL`date, event, SUM(value) AS "value" `)
    } else {
      query.append(SQL`date, event, os, version, value `)
    }
    query.append(SQL` FROM (SELECT MAX(value) as value, 'CONTACT_NOTIFICATION' as event, date, os, version FROM metrics
                    WHERE ((event = 'CALLBACK_REQUEST' AND os = '')
                    OR (event = 'CONTACT_NOTIFICATION'))
                    AND date >= ${new Date(startDate)} AND date <= ${new Date(
      endDate
    )} 
                    GROUP BY date, os, version) as contacts `)

    if (summary) {
      query.append(SQL` GROUP BY event `)
    } else if (daily) {
      query.append(SQL` GROUP BY event, date `)
    }
  }
  query.append(SQL`) as overall `)
  if (summary) {
    query.append(SQL` ORDER BY event `)
  } else if (daily) {
    query.append(SQL` ORDER BY date, event `)
  } else {
    query.append(SQL` ORDER BY date, event, os, version`)
  }
  return query
}

const payloadsSelect = ({ metrics, startDate, endDate, limit, offset }) => {
  const query = SQL`
    SELECT created_at AS "created", event, payload
    FROM metrics_payloads
    WHERE created_at >= ${new Date(startDate)}
    AND created_at <= ${new Date(endDate)}`

  if (metrics.length > 0) {
    query.append(SQL` AND event IN (`)
    query.append(
      SQL.glue(
        metrics.map(metric => SQL`${metric}`),
        ', '
      )
    )
    query.append(SQL`)`)
  }

  query.append(SQL`
    ORDER BY created_at ASC, event ASC
    LIMIT ${limit}
    OFFSET ${offset}`)

  return query
}

module.exports = { metricsInsert, metricsSelect, payloadsSelect }
