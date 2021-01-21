const SQL = require('@nearform/sql')

const verificationInsert = ({ control, code, onsetDate, testType, mobile }) =>
  SQL`INSERT INTO verifications (control, code, onset_date, test_type, mobile)
      VALUES (${control}, ${code}, ${onsetDate}, ${testType}, ${mobile})`

module.exports = { verificationInsert }
