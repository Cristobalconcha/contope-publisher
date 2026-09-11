<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Streamable HTTP MCP transport for the semantic Canvas adapter.
 *
 * The transport accepts the current stateless MCP revision and a deliberately
 * small legacy initialization path for desktop clients that have not migrated
 * yet. It never maps remote calls to the Canvas admin AJAX handlers.
 */
final class COD_MCP_Server
{
    public const REST_NAMESPACE = 'contope/v1';
    public const REST_ROUTE = '/mcp';
    public const CAPABILITY = 'manage_options';
    public const PROTOCOL_VERSION = '2026-07-28';
    public const LEGACY_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18'];

    public function __construct(private COD_Canvas_MCP_Service $service)
    {
    }

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes(): void
    {
        register_rest_route(self::REST_NAMESPACE, self::REST_ROUTE, [
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [$this, 'handle_post'],
                'permission_callback' => [$this, 'allow_transport'],
            ],
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [$this, 'handle_unsupported_http_method'],
                'permission_callback' => [$this, 'allow_transport'],
            ],
            [
                'methods' => WP_REST_Server::DELETABLE,
                'callback' => [$this, 'handle_unsupported_http_method'],
                'permission_callback' => [$this, 'allow_transport'],
            ],
        ]);
    }

    /**
     * Authentication is evaluated inside handle_post() so errors preserve the
     * JSON-RPC envelope rather than being converted into a generic REST error.
     */
    public function allow_transport(WP_REST_Request $request): bool
    {
        return true;
    }

    public function handle_unsupported_http_method(WP_REST_Request $request): WP_REST_Response
    {
        return new WP_REST_Response(null, 405, ['Allow' => 'POST']);
    }

    public function handle_post(WP_REST_Request $request): WP_REST_Response
    {
        $payload = $request->get_json_params();
        $id = is_array($payload) && array_key_exists('id', $payload) ? $payload['id'] : null;

        if (!$this->origin_is_allowed($request)) {
            return $this->error($id, -32000, 'Origin no permitido.', [], 403);
        }
        if (!current_user_can(self::CAPABILITY)) {
            return $this->error($id, -32000, 'Autenticación o permisos insuficientes.', [], 403);
        }
        if (!is_array($payload) || ($payload['jsonrpc'] ?? null) !== '2.0' || !is_string($payload['method'] ?? null)) {
            return $this->error(null, -32600, 'Solicitud JSON-RPC inválida.', [], 400);
        }
        if (array_key_exists('id', $payload) && !is_string($id) && !is_int($id) && !is_float($id) && $id !== null) {
            return $this->error(null, -32600, 'id JSON-RPC inválido.', [], 400);
        }

        $method = $payload['method'];
        $params = isset($payload['params']) && is_array($payload['params']) ? $payload['params'] : [];
        $is_notification = !array_key_exists('id', $payload);
        $is_modern = $this->is_modern_request($request, $payload);

        if ($is_modern) {
            $validation_error = $this->validate_modern_request($request, $payload, $id);
            if ($validation_error !== null) {
                return $validation_error;
            }
        } else {
            $version_error = $this->validate_legacy_version($request, $params, $id);
            if ($version_error !== null) {
                return $version_error;
            }
        }

        if ($is_notification) {
            if ($method === 'notifications/initialized') {
                return new WP_REST_Response(null, 202);
            }

            return $this->error(null, -32601, 'Notificación no compatible.', [], $is_modern ? 404 : 400);
        }

        if ($method === 'server/discover') {
            return $this->result($id, $this->discover_result(), 200);
        }
        if ($method === 'initialize' && !$is_modern) {
            return $this->result($id, $this->legacy_initialize_result($params), 200);
        }
        if ($method === 'tools/list') {
            return $this->result($id, $this->tools_list_result($is_modern), 200);
        }
        if ($method === 'tools/call') {
            return $this->handle_tool_call($id, $params, $is_modern);
        }

        return $this->error($id, -32601, 'Método MCP no encontrado.', [], $is_modern ? 404 : 200);
    }

    /** @param array<string, mixed> $params */
    private function legacy_initialize_result(array $params): array
    {
        $requested_version = isset($params['protocolVersion']) && is_string($params['protocolVersion'])
            ? $params['protocolVersion']
            : self::LEGACY_PROTOCOL_VERSIONS[0];

        return [
            'protocolVersion' => $requested_version,
            'capabilities' => ['tools' => ['listChanged' => false]],
            'serverInfo' => $this->server_info(),
            'instructions' => 'Consulta capacidades y estado antes de mutar. Las recetas se previsualizan antes de aplicarse y publicar requiere una llamada separada con intención humana explícita.',
        ];
    }

    /** @return array<string, mixed> */
    private function discover_result(): array
    {
        return [
            'resultType' => 'complete',
            'supportedVersions' => array_merge([self::PROTOCOL_VERSION], self::LEGACY_PROTOCOL_VERSIONS),
            'capabilities' => ['tools' => ['listChanged' => false]],
            '_meta' => ['io.modelcontextprotocol/serverInfo' => $this->server_info()],
            'instructions' => 'Consulta capacidades y estado antes de crear o modificar. Las recetas semánticas exigen preview, revisión esperada y revisión humana; publicar es una operación separada.',
            'ttlMs' => 0,
            'cacheScope' => 'private',
        ];
    }

    /** @return array<string, mixed> */
    private function tools_list_result(bool $is_modern): array
    {
        $result = ['tools' => $this->service->tool_definitions()];
        if (!$is_modern) {
            return $result;
        }

        return [
            'resultType' => 'complete',
            'tools' => $result['tools'],
            'ttlMs' => 0,
            'cacheScope' => 'private',
        ];
    }

    /**
     * @param mixed $id
     * @param array<string, mixed> $params
     */
    private function handle_tool_call($id, array $params, bool $is_modern): WP_REST_Response
    {
        $tool_name = isset($params['name']) && is_string($params['name']) ? $params['name'] : '';
        if ($tool_name === '' || !$this->service->has_tool($tool_name)) {
            return $this->error($id, -32602, 'Herramienta MCP desconocida.', [], 200);
        }

        $arguments = $params['arguments'] ?? [];
        if (!is_array($arguments)) {
            return $this->tool_error($id, 'cod_mcp_invalid_arguments', 'arguments debe ser un objeto JSON.', $is_modern);
        }

        $result = $this->service->call_tool($tool_name, $arguments);
        if (is_wp_error($result)) {
            $details = $result->get_error_data();
            return $this->tool_error(
                $id,
                $result->get_error_code(),
                $result->get_error_message(),
                $is_modern,
                is_array($details) ? $details : []
            );
        }

        $tool_result = [
            'content' => [[
                'type' => 'text',
                'text' => (string) wp_json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ]],
            'structuredContent' => $result,
            'isError' => false,
        ];
        if ($is_modern) {
            $tool_result = ['resultType' => 'complete'] + $tool_result;
        }

        return $this->result($id, $tool_result, 200);
    }

    /** @param mixed $id */
    private function tool_error($id, string $code, string $message, bool $is_modern, array $details = []): WP_REST_Response
    {
        $structured = [
            'code' => $code,
            'message' => $message,
        ];
        if ($details !== []) {
            $structured['details'] = $details;
        }
        $tool_result = [
            'content' => [[
                'type' => 'text',
                'text' => $message,
            ]],
            'structuredContent' => $structured,
            'isError' => true,
        ];
        if ($is_modern) {
            $tool_result = ['resultType' => 'complete'] + $tool_result;
        }

        return $this->result($id, $tool_result, 200);
    }

    /**
     * @param array<string, mixed> $payload
     * @param mixed $id
     */
    private function validate_modern_request(WP_REST_Request $request, array $payload, $id): ?WP_REST_Response
    {
        $params = isset($payload['params']) && is_array($payload['params']) ? $payload['params'] : [];
        $meta = isset($params['_meta']) && is_array($params['_meta']) ? $params['_meta'] : [];
        $header_version = (string) $request->get_header('mcp-protocol-version');
        $body_version = isset($meta['io.modelcontextprotocol/protocolVersion'])
            ? (string) $meta['io.modelcontextprotocol/protocolVersion']
            : '';

        if ($header_version === '' || $body_version === '') {
            return $this->header_mismatch($id, 'Falta MCP-Protocol-Version o _meta.io.modelcontextprotocol/protocolVersion.');
        }
        if ($header_version !== $body_version) {
            return $this->header_mismatch($id, 'MCP-Protocol-Version no coincide con _meta.');
        }
        if ($header_version !== self::PROTOCOL_VERSION) {
            return $this->unsupported_protocol($id, $header_version);
        }
        if (!array_key_exists('io.modelcontextprotocol/clientCapabilities', $meta) || !is_array($meta['io.modelcontextprotocol/clientCapabilities'])) {
            return $this->header_mismatch($id, 'Falta _meta.io.modelcontextprotocol/clientCapabilities.');
        }
        if (!$this->accepts_json_and_sse($request)) {
            return $this->header_mismatch($id, 'Accept debe declarar application/json y text/event-stream.');
        }

        $method_header = (string) $request->get_header('mcp-method');
        if ($method_header === '' || $method_header !== $payload['method']) {
            return $this->header_mismatch($id, 'Mcp-Method no coincide con method.');
        }

        if (in_array($payload['method'], ['tools/call', 'prompts/get', 'resources/read'], true)) {
            $name_key = $payload['method'] === 'resources/read' ? 'uri' : 'name';
            $name = isset($params[$name_key]) && is_string($params[$name_key]) ? $params[$name_key] : '';
            $header_name = $this->decode_header_value((string) $request->get_header('mcp-name'));
            if ($name === '' || $header_name === null || $header_name !== $name) {
                return $this->header_mismatch($id, sprintf('Mcp-Name no coincide con params.%s.', $name_key));
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $params
     * @param mixed $id
     */
    private function validate_legacy_version(WP_REST_Request $request, array $params, $id): ?WP_REST_Response
    {
        $header_version = (string) $request->get_header('mcp-protocol-version');
        if ($header_version !== '' && !in_array($header_version, self::LEGACY_PROTOCOL_VERSIONS, true)) {
            return $this->unsupported_protocol($id, $header_version);
        }

        $requested_version = isset($params['protocolVersion']) && is_string($params['protocolVersion'])
            ? $params['protocolVersion']
            : '';
        if ($requested_version !== '' && !in_array($requested_version, self::LEGACY_PROTOCOL_VERSIONS, true)) {
            return $this->unsupported_protocol($id, $requested_version);
        }

        return null;
    }

    /** @param array<string, mixed> $payload */
    private function is_modern_request(WP_REST_Request $request, array $payload): bool
    {
        if ($request->get_header('mcp-protocol-version') === self::PROTOCOL_VERSION || $payload['method'] === 'server/discover') {
            return true;
        }

        $params = isset($payload['params']) && is_array($payload['params']) ? $payload['params'] : [];
        $meta = isset($params['_meta']) && is_array($params['_meta']) ? $params['_meta'] : [];
        return ($meta['io.modelcontextprotocol/protocolVersion'] ?? null) === self::PROTOCOL_VERSION;
    }

    private function origin_is_allowed(WP_REST_Request $request): bool
    {
        $origin = trim($request->get_header('origin'));
        if ($origin === '') {
            return true;
        }

        $expected = $this->normalized_origin(home_url('/'));
        $received = $this->normalized_origin($origin);
        return $expected !== '' && $received !== '' && hash_equals($expected, $received);
    }

    private function normalized_origin(string $url): string
    {
        $parts = wp_parse_url($url);
        if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
            return '';
        }

        $scheme = strtolower((string) $parts['scheme']);
        $origin = $scheme . '://' . strtolower((string) $parts['host']);
        $port = isset($parts['port']) ? (int) $parts['port'] : 0;
        if ($port === 0 || ($scheme === 'http' && $port === 80) || ($scheme === 'https' && $port === 443)) {
            return $origin;
        }

        return $origin . ':' . $port;
    }

    private function accepts_json_and_sse(WP_REST_Request $request): bool
    {
        $accept = strtolower($request->get_header('accept'));
        return str_contains($accept, 'application/json') && str_contains($accept, 'text/event-stream');
    }

    private function decode_header_value(string $value): ?string
    {
        if ($value === '') {
            return null;
        }
        if (!str_starts_with($value, '=?base64?') || !str_ends_with($value, '?=')) {
            return preg_match('/^(?![ \\t])[\\x20-\\x7E]+(?<![ \\t])$/D', $value) === 1 ? $value : null;
        }

        $decoded = base64_decode(substr($value, 9, -2), true);
        return $decoded === false ? null : $decoded;
    }

    /** @return array{name: string, version: string} */
    private function server_info(): array
    {
        return [
            'name' => 'contope-publisher',
            'version' => COD_PUBLISHER_VERSION,
        ];
    }

    /** @param mixed $id */
    private function result($id, array $result, int $status): WP_REST_Response
    {
        return new WP_REST_Response([
            'jsonrpc' => '2.0',
            'id' => $id,
            'result' => $result,
        ], $status);
    }

    /** @param mixed $id @param array<string, mixed> $data */
    private function error($id, int $code, string $message, array $data, int $status): WP_REST_Response
    {
        $error = [
            'code' => $code,
            'message' => $message,
        ];
        if ($data !== []) {
            $error['data'] = $data;
        }

        return new WP_REST_Response([
            'jsonrpc' => '2.0',
            'id' => $id,
            'error' => $error,
        ], $status);
    }

    /** @param mixed $id */
    private function header_mismatch($id, string $message): WP_REST_Response
    {
        return $this->error($id, -32020, $message, [], 400);
    }

    /** @param mixed $id */
    private function unsupported_protocol($id, string $requested): WP_REST_Response
    {
        return $this->error($id, -32022, 'Versión de protocolo no compatible.', [
            'supported' => array_merge([self::PROTOCOL_VERSION], self::LEGACY_PROTOCOL_VERSIONS),
            'requested' => $requested,
        ], 400);
    }
}
