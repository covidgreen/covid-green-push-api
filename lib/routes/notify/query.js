const SQL = require('@nearform/sql')

const verificationInsert = ({
  control,
  code,
  onsetDate,
  testType,
  mobile,
  longCode
}) =>
  SQL`INSERT INTO verifications (control, code, onset_date, test_type, mobile, long_code)
      VALUES (${control}, ${code}, ${onsetDate}, ${testType}, ${mobile}, ${longCode})`

module.exports = { verificationInsert }
