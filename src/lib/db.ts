import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  writeBatch,
  query,
  orderBy,
  limit,
  startAfter,
  where
} from "./firebase";
import { MnemonicResult } from "../types";

/**
 * Fetches mnemonics for a specific authenticated user from Firestore with pagination.
 */
export async function getUserMnemonics(uid: string, limitCount: number = 50, lastTimestamp?: number): Promise<MnemonicResult[]> {
  try {
    const colRef = collection(db, "users", uid, "mnemonics");
    let q;
    if (lastTimestamp !== undefined) {
      q = query(
        colRef, 
        orderBy("timestamp", "desc"), 
        startAfter(lastTimestamp), 
        limit(limitCount)
      );
    } else {
      q = query(
        colRef, 
        orderBy("timestamp", "desc"), 
        limit(limitCount)
      );
    }
    const querySnapshot = await getDocs(q);
    const results: MnemonicResult[] = [];
    querySnapshot.forEach((docSnap) => {
      results.push(docSnap.data() as MnemonicResult);
    });
    return results;
  } catch (error) {
    console.error("Error fetching user mnemonics from Firestore:", error);
    throw error;
  }
}

/**
 * Saves or updates a single mnemonic under the user's personal path in Firestore.
 */
export async function saveUserMnemonic(uid: string, mnemonic: MnemonicResult): Promise<void> {
  try {
    const docRef = doc(db, "users", uid, "mnemonics", mnemonic.id);
    await setDoc(docRef, mnemonic);
  } catch (error) {
    console.error("Error saving mnemonic to Firestore:", error);
    throw error;
  }
}

/**
 * Deletes a single mnemonic from the user's personal path in Firestore.
 */
export async function deleteUserMnemonic(uid: string, id: string): Promise<void> {
  try {
    const docRef = doc(db, "users", uid, "mnemonics", id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting mnemonic from Firestore:", error);
    throw error;
  }
}

/**
 * Migrates local storage mnemonics to Firestore using a batch write.
 * It will overwrite matching document IDs or create new ones.
 */
export async function migrateLocalToFirestore(uid: string, localHistory: MnemonicResult[]): Promise<MnemonicResult[]> {
  if (!localHistory || localHistory.length === 0) return [];
  
  try {
    const colRef = collection(db, "users", uid, "mnemonics");
    const batch = writeBatch(db);
    
    // Batch is limited to 500 writes in Firestore
    const batchLimit = 250;
    const itemsToMigrate = localHistory.slice(0, batchLimit);
    
    itemsToMigrate.forEach((item) => {
      const docRef = doc(colRef, item.id);
      batch.set(docRef, item);
    });
    
    await batch.commit();
    return itemsToMigrate;
  } catch (error) {
    console.error("Error migrating local history to Firestore:", error);
    throw error;
  }
}

/**
 * Fetches all favorited mnemonics for a specific authenticated user from Firestore.
 */
export async function getUserFavorites(uid: string): Promise<MnemonicResult[]> {
  try {
    const colRef = collection(db, "users", uid, "mnemonics");
    const q = query(
      colRef,
      where("isFavorite", "==", true)
    );
    const querySnapshot = await getDocs(q);
    const results: MnemonicResult[] = [];
    querySnapshot.forEach((docSnap) => {
      results.push(docSnap.data() as MnemonicResult);
    });
    // Sort descending by timestamp on client-side to prevent composite index requirement
    results.sort((a, b) => b.timestamp - a.timestamp);
    return results;
  } catch (error) {
    console.error("Error fetching user favorites from Firestore:", error);
    throw error;
  }
}

/**
 * Deletes all non-favorite mnemonics for a specific user.
 */
export async function deleteNonFavoriteUserMnemonics(uid: string): Promise<void> {
  try {
    const colRef = collection(db, "users", uid, "mnemonics");
    const querySnapshot = await getDocs(colRef);
    const docs = querySnapshot.docs.filter(doc => !doc.data().isFavorite);
    for (let i = 0; i < docs.length; i += 500) {
      const chunk = docs.slice(i, i + 500);
      const batch = writeBatch(db);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (error) {
    console.error("Error deleting non-favorite mnemonics:", error);
    throw error;
  }
}

/**
 * Deletes all mnemonics for a specific user.
 */
export async function deleteAllUserMnemonics(uid: string): Promise<void> {
  try {
    const colRef = collection(db, "users", uid, "mnemonics");
    const querySnapshot = await getDocs(colRef);
    const docs = querySnapshot.docs;
    for (let i = 0; i < docs.length; i += 500) {
      const chunk = docs.slice(i, i + 500);
      const batch = writeBatch(db);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (error) {
    console.error("Error deleting all mnemonics:", error);
    throw error;
  }
}

/**
 * Clears all favorites for a specific user by setting isFavorite to false.
 */
export async function clearAllUserFavorites(uid: string): Promise<void> {
  try {
    const colRef = collection(db, "users", uid, "mnemonics");
    const q = query(colRef, where("isFavorite", "==", true));
    const querySnapshot = await getDocs(q);
    const docs = querySnapshot.docs;
    for (let i = 0; i < docs.length; i += 500) {
      const chunk = docs.slice(i, i + 500);
      const batch = writeBatch(db);
      chunk.forEach(d => batch.update(d.ref, { isFavorite: false }));
      await batch.commit();
    }
  } catch (error) {
    console.error("Error clearing all favorites:", error);
    throw error;
  }
}


