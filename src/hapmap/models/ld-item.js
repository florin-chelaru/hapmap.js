/**
 * Created by Florin Chelaru ( florin [dot] chelaru [at] gmail [dot] com )
 * Date: 2/29/2016
 * Time: 11:40 AM
 */

goog.provide('hapmap.models.LDItem');

//{rs1: {start: Number, id: string}, rs2: {start: Number, id: string}, pop: string, dprime: Number, rsquare: Number, lod: Number, fbin: Number}

/**
 * @param {{start: number, id: string}} rs1
 * @param {{start: number, id: string}} rs2
 * @param {string} pop
 * @param {number} dprime
 * @param {number} rsquare
 * @param {number} lod
 * @param {number} fbin
 * @constructor
 */
hapmap.models.LDItem = function(rs1, rs2, pop, dprime, rsquare, lod, fbin) {
  /**
   * @type {{start: number, id: string}}
   */
  this['rs1'] = rs1;

  /**
   * @type {{start: number, id: string}}
   */
  this['rs2'] = rs2;

  /**
   * @type {string}
   */
  this['pop'] = pop;

  /**
   * @type {number}
   */
  this['dprime'] = dprime;

  /**
   * @type {number}
   */
  this['rsquare'] = rsquare;

  /**
   * @type {number}
   */
  this['lod'] = lod;

  /**
   * @type {number}
   */
  this['fbin'] = fbin;
};

/**
 * Parses a line of text into an instance of LDItem, based on the specifications of HapMap:
 * http://hapmap.ncbi.nlm.nih.gov/downloads/ld_data/2009-04_rel27/00README.txt
 * @param {string} text
 * @returns {hapmap.models.LDItem}
 */
hapmap.models.LDItem.parse = function(text) {
  var tokens = text.split(' ', 9);
  return new hapmap.models.LDItem(
    {                         // rs1
      'start': parseInt(tokens[0], 10),
      'id': tokens[3]
    },
    {                         // rs2
      'start': parseInt(tokens[1], 10),
      'id': tokens[4]
    },
    tokens[2],                // pop
    parseFloat(tokens[5]),    // dprime
    parseFloat(tokens[6]),    // rsquare
    parseFloat(tokens[7]),    // lod
    parseInt(tokens[8], 10)); // fbin
};
