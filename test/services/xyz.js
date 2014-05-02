module.exports = function (abcService, hjkService) {
  return {
    abc: abcService.abc,
    hjk: hjkService.hjk,
    xyz: 'xyz'
  };
};