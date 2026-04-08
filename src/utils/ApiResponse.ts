class ApiResponse<T> {
    statusCode: number;
    data: T;
    message: string;
    success: boolean;
    token?: string; // Optional property

    constructor(statusCode: number, data: T, message: string = "Success", token?: string) {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.success = statusCode < 400;
        this.token = token;
    }
}

export { ApiResponse };