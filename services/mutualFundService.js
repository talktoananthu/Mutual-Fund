import axios from "axios";

const BASE_URL = "https://api.mfapi.in/mf";

export async function getAllFunds() {
  const res = await axios.get(BASE_URL);
  return res.data;
}

export async function getNAVHistory(schemeCode) {
  const res = await axios.get(`${BASE_URL}/${schemeCode}`);
  return res.data;
}

export async function getLatestNAV(schemeCode) {
  const res = await axios.get(`${BASE_URL}/${schemeCode}`);
  return res.data; 
}