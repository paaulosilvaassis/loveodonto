import { loadDb, withDb } from '../db/index.js';
import { createId, normalizeText } from './helpers.js';

const ensurePatient = (db, patientId) => {
  const patient = db.patients.find((item) => item.id === patientId);
  if (!patient) throw new Error(`Paciente não encontrado (id: ${patientId || 'vazio'})`);
  return patient;
};

export const listAlbums = (patientId) => {
  const db = loadDb();
  ensurePatient(db, patientId);
  db.patientPhotoAlbums = db.patientPhotoAlbums || [];
  return db.patientPhotoAlbums.filter((item) => item.patient_id === patientId);
};

export const createAlbum = (patientId, payload, userId) => {
  return withDb((db) => {
    ensurePatient(db, patientId);
    db.patientPhotoAlbums = db.patientPhotoAlbums || [];
    const album = {
      id: createId('album'),
      patient_id: patientId,
      name: normalizeText(payload.name),
      created_by: normalizeText(userId || ''),
      created_at: new Date().toISOString(),
    };
    db.patientPhotoAlbums.unshift(album);
    return album;
  });
};

export const listAlbumPhotos = (albumId) => {
  const db = loadDb();
  db.patientAlbumPhotos = db.patientAlbumPhotos || [];
  return db.patientAlbumPhotos.filter((item) => item.album_id === albumId);
};

export const addAlbumPhoto = (albumId, payload, userId) => {
  return withDb((db) => {
    db.patientAlbumPhotos = db.patientAlbumPhotos || [];
    const entry = {
      id: createId('photo'),
      album_id: albumId,
      file_url: normalizeText(payload.file_url || ''),
      file_id: normalizeText(payload.file_id || ''),
      caption: normalizeText(payload.caption || ''),
      note: normalizeText(payload.note || ''),
      procedure: normalizeText(payload.procedure || ''),
      taken_at: normalizeText(payload.taken_at || ''),
      uploaded_by: normalizeText(userId || ''),
      uploaded_at: new Date().toISOString(),
    };
    db.patientAlbumPhotos.unshift(entry);
    return entry;
  });
};
