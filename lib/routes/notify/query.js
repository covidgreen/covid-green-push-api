const SQL = require('@nearform/sql')

const verificationInsert = ({ control, code, onsetDate }) =>
  SQL`INSERT INTO verifications (control, code, onset_date)
      VALUES (${control}, ${code}, ${onsetDate})`

module.exports = { verificationInsert }
