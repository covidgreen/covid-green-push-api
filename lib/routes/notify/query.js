const SQL = require('@nearform/sql')

const verificationInsert = ({ control, code, onsetDate, testType }) =>
  SQL`INSERT INTO verifications (control, code, onset_date, test_type)
      VALUES (${control}, ${code}, ${onsetDate}, ${testType})`

module.exports = { verificationInsert }
