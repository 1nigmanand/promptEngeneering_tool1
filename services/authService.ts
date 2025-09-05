import { User } from '../types';

let currentUser: User | null = null;

const USERS_KEY = 'pec_users';
const CURRENT_USER_KEY = 'pec_current_user';

function getUsers(): Record<string, string> {
  const raw = localStorage.getItem(USERS_KEY);
  return raw ? JSON.parse(raw) : {};
}

function setUsers(users: Record<string, string>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function setCurrentUser(user: User | null) {
  currentUser = user;
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}

export const login = async (email: string, password: string): Promise<User> => {
  await new Promise((r) => setTimeout(r, 500));
  const users = getUsers();
  if (!users[email]) {
    throw new Error('User not found. Please sign up first.');
  }
  if (users[email] !== password) {
    throw new Error('Incorrect password.');
  }
  const user = { email };
  setCurrentUser(user);
  return user;
};

export const signup = async (email: string, password: string): Promise<User> => {
  await new Promise((r) => setTimeout(r, 500));
  const users = getUsers();
  if (users[email]) {
    throw new Error('Email already exists.');
  }
  users[email] = password;
  setUsers(users);
  const user = { email };
  setCurrentUser(user);
  return user;
};

export const logout = async (): Promise<void> => {
  await new Promise((r) => setTimeout(r, 200));
  setCurrentUser(null);
};

export const getCurrentUser = (): User | null => {
  if (currentUser) return currentUser;
  const raw = localStorage.getItem(CURRENT_USER_KEY);
  if (raw) {
    try {
      currentUser = JSON.parse(raw);
      return currentUser;
    } catch {
      return null;
    }
  }
  return null;
};
