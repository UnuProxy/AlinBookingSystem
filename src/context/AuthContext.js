// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleProvider, db } from '../firebase/firebaseConfig';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

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
            // Check if user is in 'approvedUsers' collection (doc ID = email)
            const approvedUserRef = doc(db, 'approvedUsers', authUser.email);
            const approvedSnap = await getDoc(approvedUserRef);

            if (!approvedSnap.exists()) {
              await signOut(auth);
              setAuthError("Unauthorized user. Please contact the administrator for access.");
              setUser(null);
              setUserRole(null);
              setLoading(false);
              return;
            }

            const approvedUser = approvedSnap.data();
            const role = approvedUser.role;

            // Create 'users' document
            await setDoc(userDocRef, {
              email: authUser.email,
              name: authUser.displayName,
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
          setAuthError("Failed to assign role. Please contact the administrator.");
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
