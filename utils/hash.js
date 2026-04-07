import CryptoJS from "crypto-js";

function makeHash(value = "") {
  return CryptoJS.SHA256(String(value)).toString();
}

export { makeHash };
