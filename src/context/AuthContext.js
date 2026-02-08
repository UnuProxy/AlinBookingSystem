// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleProvider, db } from '../firebase/firebaseConfig';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  limit
} from 'firebase/firestore';

const AuthContext = createContext({});

/**
 * Fetch admin emails from environment variables.
 * Ensure that these emails correspond to users who should have admin privileges.
 * Since role assignments are now handled via the 'approvedUsers' collection in 'userManagement.js',
 * 'adminEmails' is no longer required here and can be removed.
 */

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [authError, setAuthError] = useState(null);

  const getApprovedUserByEmail = async (email) => {
    if (!email) return null;

    const rawEmail = String(email).trim();
    const normalizedEmail = rawEmail.toLowerCase();

    // Fast path: doc id equals (normalized) email.
    const normalizedDocSnap = await getDoc(doc(db, 'approvedUsers', normalizedEmail));
    if (normalizedDocSnap.exists()) {
      return { id: normalizedDocSnap.id, ...normalizedDocSnap.data() };
    }

    // Back-compat: doc id may equal raw email (older data).
    if (rawEmail !== normalizedEmail) {
      const rawDocSnap = await getDoc(doc(db, 'approvedUsers', rawEmail));
      if (rawDocSnap.exists()) {
        return { id: rawDocSnap.id, ...rawDocSnap.data() };
      }
    }

    // Back-compat: doc id may be UID or auto-id; fall back to querying by email field.
    const normalizedQuery = query(
      collection(db, 'approvedUsers'),
      where('email', '==', normalizedEmail),
      limit(1)
    );
    const normalizedMatches = await getDocs(normalizedQuery);
    if (!normalizedMatches.empty) {
      const match = normalizedMatches.docs[0];
      return { id: match.id, ...match.data() };
    }

    if (rawEmail !== normalizedEmail) {
      const rawQuery = query(
        collection(db, 'approvedUsers'),
        where('email', '==', rawEmail),
        limit(1)
      );
      const rawMatches = await getDocs(rawQuery);
      if (!rawMatches.empty) {
        const match = rawMatches.docs[0];
        return { id: match.id, ...match.data() };
      }
    }

    return null;
  };

  const updateUserActivity = async (authUser, role, existingData = {}) => {
    try {
      const userRef = doc(db, 'users', authUser.uid);
      await setDoc(userRef, {
        email: authUser.email,
        name: authUser.displayName,
        photoURL: authUser.photoURL || null,
        role: role,
        lastLogin: serverTimestamp(),
        lastActive: serverTimestamp(),
        loginCount: (existingData.loginCount || 0) + 1,
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language
        },
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error updating user activity:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          const normalizedEmail = authUser.email ? authUser.email.trim().toLowerCase() : null;

          // Check if user already exists in 'users' collection (by UID doc)
          const userDocRef = doc(db, 'users', authUser.uid);
          const userSnap = await getDoc(userDocRef);

          if (userSnap.exists()) {
            const role = userSnap.data().role;
            setUser(authUser);
            setUserRole(role);
            setAuthError(null);
            await updateUserActivity(authUser, role, userSnap.data());
          } else {
            // Check if user is in 'approvedUsers' collection.
            // Historically, doc IDs have been stored as email, UID, or auto-id, so we support all.
            const approvedUser = await getApprovedUserByEmail(normalizedEmail || authUser.email);

            if (!approvedUser) {
              await signOut(auth);
              setAuthError(
                normalizedEmail
                  ? `Unauthorized user (${normalizedEmail}). Please contact the administrator for access.`
                  : 'Unauthorized user. Please contact the administrator for access.'
              );
              setUser(null);
              setUserRole(null);
              setLoading(false);
              return;
            }

            const role = approvedUser.role;

            // Create 'users' document
            await setDoc(userDocRef, {
              email: normalizedEmail || authUser.email,
              name: authUser.displayName || approvedUser.name || approvedUser.displayName || (normalizedEmail || authUser.email),
              role: role,
              createdAt: serverTimestamp()
            });

            setUser(authUser);
            setUserRole(role);
            setAuthError(null);
            await updateUserActivity(authUser, role);
          }
        } catch (error) {
          console.error('Error assigning role:', error);
          await signOut(auth);
          const errorCode = error?.code ? String(error.code) : null;
          let message = 'Failed to assign role.';

          if (errorCode === 'permission-denied') {
            message += ' Firestore rules are blocking access.';
          } else if (errorCode === 'unavailable') {
            message += ' Firestore is unavailable (network/server issue).';
          }

          if (errorCode) {
            message += ` (${errorCode})`;
          }

          if (error?.message) {
            const details = String(error.message).slice(0, 300);
            message += ` ${details}`;
          }

          message += ' Please contact the administrator.';
          setAuthError(message);
          setUser(null);
          setUserRole(null);
        }
      } else {
        setUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
      return { success: true };
    } catch (error) {
      console.error('Google sign-in error:', error);
      setAuthError(error.message);
      return { success: false, error: error.message };
    }
  };

  const loginWithEmail = async (email, password) => {
    try {
      setAuthError(null);
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (error) {
      console.error('Email sign-in error:', error);
      setAuthError(error.message);
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, error: error.message };
    }
  };

  const isAdmin = () => userRole === 'admin';
  const isStaff = () => userRole === 'staff';

  return (
    <AuthContext.Provider value={{
      user,
      userRole,
      loginWithGoogle,
      loginWithEmail,
      logout,
      isAdmin,
      isStaff,
      loading,
      authError
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
