<?php
/**
 * Created by PhpStorm.
 * User: florinc
 * Date: 9/30/2015
 * Time: 4:10 PM
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Range');
header('Access-Control-Expose-Headers: Content-Range');

$file_uri = $_GET['q'];
if (!$file_uri) { exit; }

$range = $_GET['r'];
if (!$range) { exit; }

function parse_headers($headers_str) {
  $headers = array();
  foreach (explode("\n", $headers_str) as $i => $line)
    if ($i === 0) {
      $headers['http_code'] = $line;
    } else {
      if (empty(trim($line))) {
        continue;
      }
      list ($key, $value) = explode(': ', $line);
      $headers[$key] = $value;
    }

  return $headers;
}

$url = $file_uri;
$resource = curl_init();
curl_setopt($resource, CURLOPT_URL, $url);
curl_setopt($resource, CURLOPT_RANGE, $range);
curl_setopt($resource, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($resource, CURLOPT_BINARYTRANSFER, 1);
curl_setopt($resource, CURLOPT_HEADER, 1);
$response = curl_exec($resource);

// Then, after your curl_exec call:
$header_size = curl_getinfo($resource, CURLINFO_HEADER_SIZE);
$headers = parse_headers(substr($response, 0, $header_size));
header('Content-Range: '.$headers['Content-Range']);
$body = substr($response, $header_size);

curl_close($resource);

echo $body;
