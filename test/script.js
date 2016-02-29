/**
 * Created by Florin Chelaru ( florin [dot] chelaru [at] gmail [dot] com )
 * Date: 2/18/2016
 * Time: 2:47 PM
 */

var hr;

$(function() {
  //hr = new hapmap.HapmapReader('http://hapmap.ncbi.nlm.nih.gov/downloads/ld_data/2009-04_rel27/ld_chr1_ASW.txt.gz', '../src/php/partial.php');
  //hr = new hapmap.HapmapReader('http://localhost/hapmap/test/ld_chr1_ASW.txt.gz', '../src/php/partial.php');
  //hr = new hapmap.HapmapReader('ld_chr1_ASW.txt.gz');
  hr = new hapmap.HapmapReader('test.txt');
  /*hr.getFileBoundaries().then(
    /!** @param {{start: number, end: number}} r *!/
    function(r) {
      console.log(r);
  });*/
  hr.getRange(554631, 711156).then(
    function(items) {
      console.log(items);
    },
    function(reason) {
      console.log('Failed: ', reason);
    }
  );
});
