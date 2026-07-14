package updates

import (
	"bytes"
	"testing"
)

func TestBoundedBufferLimitsCapturedOutput(t *testing.T) {
	buffer := &boundedBuffer{limit: 4}
	input := []byte("sensitive-output")
	written, err := buffer.Write(input)
	if err != nil || written != len(input) {
		t.Fatalf("bounded writer returned %d, %v", written, err)
	}
	if buffer.String() != "sens" || !buffer.truncated {
		t.Fatalf("output was not bounded: %q truncated=%v", buffer.String(), buffer.truncated)
	}
}

func TestCommandEnvironmentIsLocaleStable(t *testing.T) {
	environment := bytes.Join(func() [][]byte {
		values := commandEnvironment()
		result := make([][]byte, len(values))
		for index, value := range values {
			result[index] = []byte(value)
		}
		return result
	}(), []byte("\n"))
	if !bytes.Contains(environment, []byte("LC_ALL=C")) || !bytes.Contains(environment, []byte("LANG=C")) {
		t.Fatal("command environment is not locale-stable")
	}
}
