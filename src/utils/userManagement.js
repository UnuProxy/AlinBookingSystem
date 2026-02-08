// src/utils/userManagement.js
import { db } from '../firebase/firebaseConfig';
import { 
  doc, 
  setDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';

// Fetch admin emails from environment variables
const adminEmails = process.env.REACT_APP_ADMIN_EMAILS
  ? process.env.REACT_APP_ADMIN_EMAILS.split(',').map(email => email.trim())
  : ['julian.pirvu@gmail.com']; // Default admin email

/**
 * Adds or updates a user in the 'approvedUsers' collection.
 * @param {Object} userData - The user data containing email, name, and role.
 * @returns {Object} - Result of the operation with success status and message.
 */
export const addApprovedUser = async (userData) => {
  try {
    const normalizedEmail = String(userData.email || '').trim().toLowerCase();

    // Validate email
    if (!normalizedEmail || !normalizedEmail.endsWith('@gmail.com')) {
      throw new Error('Only Gmail addresses are allowed');
    }

    // Validate required fields
    if (!userData.name || !userData.role) {
      throw new Error('Name and role are required');
    }

    console.log('Received user data:', { ...userData, email: normalizedEmail }); // Debug log

    // Use email as document ID in 'approvedUsers'
    const approvedUserRef = doc(db, 'approvedUsers', normalizedEmail);

    // Check if user is already approved
    const q = query(collection(db, 'approvedUsers'), where('email', '==', normalizedEmail));
    const approvedUserSnapshot = await getDocs(q);
    
    if (!approvedUserSnapshot.empty) {
      throw new Error('User is already approved');
    }

    // Prepare user data for Firestore
    const userDataForFirestore = {
      email: normalizedEmail,
      name: userData.name,
      displayName: userData.name, // Ensure displayName is set
      role: userData.role, // Use the role from the form
      createdAt: new Date()
    };

    console.log('Saving user data to Firestore:', userDataForFirestore); // Debug log

    // Add user to 'approvedUsers'
    await setDoc(approvedUserRef, userDataForFirestore, { merge: true });

    return {
      success: true,
      message: userData.role === 'admin' 
        ? 'Admin user added successfully.' 
        : 'User added successfully.'
    };
  } catch (error) {
    console.error('Error adding approved user:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

/**
 * Removes a user from the 'approvedUsers' collection.
 * @param {string} email - The email of the user to remove.
 * @returns {Object} - Result of the operation.
 */
export const removeApprovedUser = async (email) => {
  try {
    if (!email) {
      throw new Error('Email is required for user removal');
    }

    const approvedUserRef = doc(db, 'approvedUsers', String(email).trim().toLowerCase());
    await deleteDoc(approvedUserRef);

    return { 
      success: true,
      message: 'User removed successfully'
    };
  } catch (error) {
    console.error('Error removing approved user:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

/**
 * Removes a user from the 'users' collection.
 * @param {string} uid - The UID of the user to remove.
 * @returns {Object} - Result of the operation.
 */
export const removeUser = async (uid) => {
  try {
    if (!uid) {
      throw new Error('User ID is required for user removal');
    }

    await deleteDoc(doc(db, 'users', uid));
    
    return { 
      success: true,
      message: 'User removed successfully'
    };
  } catch (error) {
    console.error('Error removing user:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

// Optional: Function to check if an email is in the admin list
export const isAdminEmail = (email) => {
  return adminEmails.includes(email);
};

// Optional: Function to validate user data
export const validateUserData = (userData) => {
  const errors = [];
  
  if (!userData.email) {
    errors.push('Email is required');
  } else if (!userData.email.endsWith('@gmail.com')) {
    errors.push('Only Gmail addresses are allowed');
  }
  
  if (!userData.name || userData.name.trim() === '') {
    errors.push('Name is required');
  }
  
  if (!userData.role || !['admin', 'staff'].includes(userData.role)) {
    errors.push('Valid role is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};
