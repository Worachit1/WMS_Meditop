import axios from "axios";

axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/auth/login";
    }
    return Promise.reject(error);
  }
);