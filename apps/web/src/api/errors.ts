import axios from 'axios'

// Turns an API failure into a message for the person using the form. It never shows the
// API's own message: those are internal and in English.
export function getErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error) || !error.response) {
    return 'Não foi possível conectar ao servidor. Tente novamente.'
  }

  switch (error.response.status) {
    case 400:
      return 'Verifique os dados informados.'
    case 401:
      return 'Email ou senha inválidos.'
    case 404:
      return 'Conteúdo não encontrado.'
    case 409:
      return 'Este email já está cadastrado.'
    case 429: {
      const seconds = Number(error.response.headers['retry-after'])
      return seconds > 0
        ? `Muitas tentativas. Aguarde ${seconds} segundos e tente novamente.`
        : 'Muitas tentativas. Aguarde um minuto e tente novamente.'
    }
    default:
      return 'Algo deu errado. Tente novamente.'
  }
}

export function isUnauthorized(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401
}

export function isNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404
}

export function isConflict(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 409
}
